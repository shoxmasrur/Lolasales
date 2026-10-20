import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DebitorApi } from './api.js';
import { toolError, toolJson } from './shared.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';

const baseUrl = (process.env.DEBITOR_API_URL ?? 'http://localhost:4100').replace(/\/+$/, '');
const apiKey = process.env.DEBITOR_API_KEY ?? '';
const timeoutMs = Number(process.env.DEBITOR_TIMEOUT_MS ?? 30_000);

if (!apiKey) {
  // stdout MCP protokoli uchun band — xabarlar faqat stderr ga.
  process.stderr.write(
    'DEBITOR_API_KEY berilmagan.\n' +
      'Dashboard → Foydalanuvchilar → API kalitlar bo\'limidan kalit yarating.\n',
  );
  process.exit(1);
}

const api = new DebitorApi({ baseUrl, apiKey, timeoutMs });

const server = new McpServer({ name: 'debitor', version: '0.1.0' });

/** Ulanish holatini tekshirish — kalit va ruxsatlar to'g'rimi. */
server.registerTool(
  'debitor_whoami',
  {
    title: 'Ulanishni tekshirish',
    description:
      'Debitor tizimiga qaysi hisob va rol bilan ulanganini hamda qanday ruxsatlar borligini qaytaradi. ' +
      'Boshqa asboblar "ruxsat yo\'q" desa, avval shuni chaqiring.',
    inputSchema: {},
  },
  async () => {
    try {
      const me = await api.get<{
        user: { fullName: string; email: string; role: { key: string; name: string } };
        permissions: string[];
      }>('/auth/me');

      return toolJson({
        server: baseUrl,
        user: me.user.fullName,
        email: me.user.email,
        role: `${me.user.role.name} (${me.user.role.key})`,
        permissions: me.permissions,
        // Muhim: bu MCP server mijozga xabar yubora olmaydi (asbob yo'q).
        canSendMessagesViaMcp: false,
      });
    } catch (err) {
      return toolError(err);
    }
  },
);

registerReadTools(server, api);
registerWriteTools(server, api);

await server.connect(new StdioServerTransport());
process.stderr.write(`Debitor MCP server ishga tushdi → ${baseUrl}\n`);
