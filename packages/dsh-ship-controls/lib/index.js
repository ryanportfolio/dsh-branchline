/** DeepSeek Harness Host plugin: session ship controls (client-only feature). */

export const name = 'dsh-ship-controls'
export const inject = []

export function apply(ctx) {
  // No host behavior: the buttons deliver their signal through the client
  // composer pipeline, so the host half stays an intentional no-op.
  void ctx
}
