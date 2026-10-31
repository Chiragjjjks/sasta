import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Never touch the real ~/.sasta/mcp from tests.
process.env.SASTA_MCP_HOME = mkdtempSync(join(tmpdir(), 'sasta-mcp-test-'))
