const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

const FAILURES: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /(?:bash:\s*)?(?:cursor-agent|claude|codex|gemini):\s*command not found/i,
    reason: 'Harness 二进制不在 PATH 上。'
  },
  {
    pattern: /permission_denied[\s\S]{0,240}not permitted on this endpoint/i,
    reason: 'Cursor Agent 认证失败：当前会话 token 不能调用 Cursor API。'
  },
  {
    pattern: /not logged in/i,
    reason: 'Cursor Agent 未登录。'
  }
]

export function stripJrHarnessPtyAnsi(chunk: string): string {
  return chunk.replace(ANSI, '')
}

export function matchJrHarnessPtyFailure(output: string): string | null {
  const text = stripJrHarnessPtyAnsi(output)
  for (const failure of FAILURES) {
    if (failure.pattern.test(text)) {
      return failure.reason
    }
  }
  return null
}

export function createJrHarnessPtyFailureScanner(): (chunk: string) => string | null {
  let buffer = ''
  let matched: string | null = null
  return (chunk: string): string | null => {
    if (matched) {
      return null
    }
    buffer = `${buffer}${stripJrHarnessPtyAnsi(chunk)}`.slice(-12_000)
    matched = matchJrHarnessPtyFailure(buffer)
    return matched
  }
}
