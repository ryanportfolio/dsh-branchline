# Makes the DSH host refuse termination at the OS level, so agent shells may
# kill any other process with any command shape.
#
# Adds a deny-PROCESS_TERMINATE ACE for Everyone to the process DACL of:
#   - the DSH host process (-ProcessId);
#   - its ancestors while they are node, cmd, pwsh, or powershell (the npx and
#     launcher chain: killing the launcher breaks the pipe DSH logs into);
#   - the console host (conhost or OpenConsole) each of those processes is
#     attached to, as Windows reports it (killing a console host closes the
#     console and every process attached to it).
# Then verifies that this unelevated caller can no longer open each one for
# termination, and prints {"pids":[...],"failed":[...]} as JSON.
#
# The process owner keeps WRITE_DAC implicitly, so this stops accidents, not a
# deliberate attacker; SeDebugPrivilege (elevated Task Manager) also bypasses it.
# -Release removes the ACE from one PID; the launcher calls it before it stops DSH.
param([Parameter(Mandatory = $true)][int]$ProcessId, [switch]$Release)
$ErrorActionPreference = 'Stop'

if (-not ('DshBranchline.ProcessShield' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

namespace DshBranchline
{
    public static class ProcessShield
    {
        const int ProcessTerminate = 0x1, ReadControl = 0x20000, WriteDac = 0x40000, DaclInformation = 4;
        static readonly SecurityIdentifier Everyone = new SecurityIdentifier(WellKnownSidType.WorldSid, null);

        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetKernelObjectSecurity(IntPtr handle, int information, byte[] descriptor, int length, out int needed);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetKernelObjectSecurity(IntPtr handle, int information, byte[] descriptor);
        [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr handle, int information, out IntPtr value, int length, out int written);

        static bool IsShield(GenericAce ace)
        {
            CommonAce common = ace as CommonAce;
            return common != null && common.AceQualifier == AceQualifier.AccessDenied && common.AccessMask == ProcessTerminate && common.SecurityIdentifier == Everyone;
        }

        public static void Set(int pid, bool deny)
        {
            IntPtr handle = OpenProcess(ReadControl | WriteDac, false, pid);
            if (handle == IntPtr.Zero) throw new Win32Exception();
            try
            {
                int needed;
                GetKernelObjectSecurity(handle, DaclInformation, null, 0, out needed);
                if (needed <= 0) throw new Win32Exception();
                byte[] buffer = new byte[needed];
                if (!GetKernelObjectSecurity(handle, DaclInformation, buffer, needed, out needed)) throw new Win32Exception();
                RawSecurityDescriptor descriptor = new RawSecurityDescriptor(buffer, 0);
                RawAcl acl = descriptor.DiscretionaryAcl;
                if (acl == null) throw new InvalidOperationException("process has a NULL DACL");
                for (int i = acl.Count - 1; i >= 0; i--) if (IsShield(acl[i])) acl.RemoveAce(i);
                if (deny) acl.InsertAce(0, new CommonAce(AceFlags.None, AceQualifier.AccessDenied, ProcessTerminate, Everyone, false, null));
                descriptor.DiscretionaryAcl = acl;
                byte[] updated = new byte[descriptor.BinaryLength];
                descriptor.GetBinaryForm(updated, 0);
                if (!SetKernelObjectSecurity(handle, DaclInformation, updated)) throw new Win32Exception();
            }
            finally { CloseHandle(handle); }
        }

        /// PID of the console host the process is attached to, or 0 for none.
        /// ProcessConsoleHostProcess (49) sets bit 0 when a console is attached;
        /// without a console it returns the process's own PID.
        public static int ConsoleHost(int pid)
        {
            IntPtr handle = OpenProcess(0x1000, false, pid);
            if (handle == IntPtr.Zero) throw new Win32Exception();
            try
            {
                IntPtr value;
                int written;
                int status = NtQueryInformationProcess(handle, 49, out value, IntPtr.Size, out written);
                if (status != 0) throw new Win32Exception("console host query failed: NTSTATUS 0x" + status.ToString("X8"));
                long raw = value.ToInt64();
                return (raw & 1) == 0 ? 0 : (int)(raw & ~3L);
            }
            finally { CloseHandle(handle); }
        }

        /// True when a fresh terminate handle is refused with ERROR_ACCESS_DENIED.
        public static bool Refuses(int pid)
        {
            IntPtr handle = OpenProcess(ProcessTerminate, false, pid);
            if (handle != IntPtr.Zero) { CloseHandle(handle); return false; }
            return Marshal.GetLastWin32Error() == 5;
        }
    }
}
'@
}

if ($Release) {
    [DshBranchline.ProcessShield]::Set($ProcessId, $false)
    exit
}

$rows = @{}
foreach ($row in Get-CimInstance Win32_Process) { $rows[[int]$row.ProcessId] = $row }
if (-not $rows.ContainsKey($ProcessId)) { throw "process $ProcessId not found" }

$chain = New-Object System.Collections.Generic.List[int]
$cursor = $ProcessId
for (;;) {
    $chain.Add($cursor)
    $parent = [int]$rows[$cursor].ParentProcessId
    # A parent created after its child is a reused PID: the real parent exited.
    if (-not $rows.ContainsKey($parent) -or $chain.Contains($parent) -or $rows[$parent].CreationDate -gt $rows[$cursor].CreationDate) { break }
    if ($rows[$parent].Name -notmatch '^(?:node|cmd|pwsh|powershell)\.exe$') { break }
    $cursor = $parent
}
$done = @()
$failed = @()
# Ask Windows which console each chain process uses: parent links miss a console
# whose creator exited, and over-match other tabs of the same terminal.
$targets = @($chain)
foreach ($member in $chain) {
    try { $consoleHost = [DshBranchline.ProcessShield]::ConsoleHost($member) }
    catch { $failed += @{ pid = $member; name = $rows[$member].Name; error = 'console host unknown: ' + $_.Exception.Message }; continue }
    if ($consoleHost -and $targets -notcontains $consoleHost) {
        if (-not $rows.ContainsKey($consoleHost) -or $rows[$consoleHost].Name -notmatch '^(?:conhost|OpenConsole)\.exe$') {
            $failed += @{ pid = $consoleHost; name = $(if ($rows.ContainsKey($consoleHost)) { $rows[$consoleHost].Name }); error = "unexpected console host for $member" }
            continue
        }
        $targets += $consoleHost
    }
}
foreach ($target in $targets) {
    $name = $rows[$target].Name
    try {
        [DshBranchline.ProcessShield]::Set($target, $true)
        if (-not [DshBranchline.ProcessShield]::Refuses($target)) { throw 'terminate handle still granted' }
        $done += @{ pid = $target; name = $name }
    } catch {
        $failed += @{ pid = $target; name = $name; error = $_.Exception.Message }
    }
}
ConvertTo-Json -InputObject @{ pids = @($done); failed = @($failed) } -Depth 4 -Compress
