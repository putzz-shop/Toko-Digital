import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory secure configuration (kept secret on the server)
let pterodactylConfig = {
  panelUrl: process.env.PTERODACTYL_PANEL_URL || 'https://panel-putzzpedia.pterocloud.my.id',
  apiKey: process.env.PTERODACTYL_API_KEY || 'ptla_8Qe7rQhRkgYqfNWsG0CfRtxFNERRofxYt7p0NPcZIE1',
  adminPin: process.env.ADMIN_PIN || '112233',
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // PUBLIC ENDPOINT: Check live real server status without leaking any API keys
  app.get('/api/pterodactyl/status', async (req, res) => {
    try {
      const cleanUrl = pterodactylConfig.panelUrl.replace(/\/+$/, '');
      const headers = {
        Authorization: `Bearer ${pterodactylConfig.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      // Fetch Nodes & Servers in parallel from Pterodactyl Application API
      const [nodesRes, serversRes] = await Promise.all([
        fetch(`${cleanUrl}/api/application/nodes`, { headers }),
        fetch(`${cleanUrl}/api/application/servers`, { headers }),
      ]);

      if (!nodesRes.ok || !serversRes.ok) {
        return res.status(502).json({
          success: false,
          online: false,
          message: 'Pterodactyl API error or invalid credentials',
          panelUrl: cleanUrl,
        });
      }

      const nodesData = (await nodesRes.json()) as { data?: Array<{ attributes?: Record<string, unknown> }> };
      const serversData = (await serversRes.json()) as { data?: Array<{ attributes?: Record<string, unknown> }> };

      const sanitizedNodes = (nodesData.data || []).map((item) => {
        const attr = item.attributes || {};
        return {
          id: attr.id,
          name: attr.name,
          fqdn: attr.fqdn,
          locationId: attr.location_id,
          maintenance: attr.maintenance_mode,
          memory: attr.memory,
          disk: attr.disk,
        };
      });

      const sanitizedServers = (serversData.data || []).map((item) => {
        const attr = item.attributes || {};
        return {
          id: attr.id,
          name: attr.name,
          identifier: attr.identifier,
          suspended: attr.suspended,
          node: attr.node,
          updatedAt: attr.updated_at,
        };
      });

      return res.json({
        success: true,
        online: true,
        panelUrl: cleanUrl,
        totalNodes: sanitizedNodes.length,
        totalServers: sanitizedServers.length,
        nodes: sanitizedNodes,
        servers: sanitizedServers,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        online: false,
        message: 'Gagal menghubungi Pterodactyl API',
        panelUrl: pterodactylConfig.panelUrl,
      });
    }
  });

  // ADMIN ENDPOINT: Verify Admin PIN
  app.post('/api/pterodactyl/admin/auth', (req, res) => {
    const { pin } = req.body;
    if (pin && String(pin) === pterodactylConfig.adminPin) {
      return res.json({ success: true, authorized: true });
    }
    return res.status(401).json({ success: false, message: 'PIN Admin salah!' });
  });

  // ADMIN ENDPOINT: Get Current Configuration (Requires Admin PIN header)
  app.get('/api/pterodactyl/admin/config', (req, res) => {
    const pin = req.headers['x-admin-pin'];
    if (String(pin) !== pterodactylConfig.adminPin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Mask key for safety
    const key = pterodactylConfig.apiKey;
    const maskedKey = key.length > 12 ? `${key.substring(0, 7)}...${key.substring(key.length - 4)}` : '***';

    return res.json({
      panelUrl: pterodactylConfig.panelUrl,
      maskedApiKey: maskedKey,
      hasKey: Boolean(pterodactylConfig.apiKey),
    });
  });

  // ADMIN ENDPOINT: Update Configuration (Requires Admin PIN header)
  app.post('/api/pterodactyl/admin/config', (req, res) => {
    const pin = req.headers['x-admin-pin'];
    if (String(pin) !== pterodactylConfig.adminPin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { panelUrl, apiKey, newPin } = req.body;
    if (panelUrl) pterodactylConfig.panelUrl = panelUrl.trim();
    if (apiKey) pterodactylConfig.apiKey = apiKey.trim();
    if (newPin && String(newPin).length >= 4) pterodactylConfig.adminPin = String(newPin).trim();

    return res.json({
      success: true,
      message: 'Konfigurasi Pterodactyl berhasil disimpan!',
      panelUrl: pterodactylConfig.panelUrl,
    });
  });

  // Vite development middleware
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PutzzPedia server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
