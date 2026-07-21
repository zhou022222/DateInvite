const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = requiredEnv.filter(name => {
  const value = process.env[name];
  return !value || value.includes('your-') || value.includes('paste-your-');
});

if (missingEnv.length) {
  console.error(`缺少环境变量: ${missingEnv.join(', ')}`);
  console.error('请复制 .env.example 为 .env，并填入 Supabase 项目的 URL 和 service_role key。');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// ── 静态文件服务 ──
// 使用 express.static 替代手动 Map，自动处理 favicon.ico、.css、.js 等
app.use(express.static(path.join(__dirname), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    if (filePath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
  }
}));

// 手动覆盖 index.html 路由（确保 / 和 /index.html 行为一致）
app.get(['/', '/index.html', '/create.html'], (req, res) => {
  const file = req.path === '/create.html' ? 'create.html' : 'index.html';
  res.sendFile(path.join(__dirname, file));
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// ── API 错误处理 ──
function toClientError(error) {
  if (!error) return '请求失败';
  if (error.code === '23505') return '已经回应过了';
  if (error.message) return error.message;
  return '请求失败';
}

// API: 创建邀请
app.post('/api/invitations', async (req, res) => {
  const { creator_id, from_name, to_name, intro, note } = req.body;
  if (!creator_id || !from_name || !to_name) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const { error } = await supabase
    .from('invitations')
    .insert({
      id,
      creator_id,
      from_name,
      to_name,
      intro: intro || '',
      note: note || '',
      status: 'pending'
    });

  if (error) {
    console.error('create invitation failed:', error);
    return res.status(500).json({ error: toClientError(error) });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({ id, link: `${baseUrl}/index.html?id=${id}` });
});

// API: 查看我的所有邀请
app.get('/api/invitations', async (req, res) => {
  const { creator_id } = req.query;
  if (!creator_id) return res.status(400).json({ error: '缺少 creator_id' });

  let invitations;
  try {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('creator_id', creator_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    invitations = data;
  } catch (error) {
    console.error('list invitations failed:', error);
    return res.status(500).json({ error: toClientError(error) });
  }

  const ids = invitations.map(inv => inv.id);
  let responsesByInviteId = new Map();

  if (ids.length) {
    try {
      const { data: responses, error: responsesError } = await supabase
        .from('responses')
        .select('*')
        .in('invitation_id', ids);

      if (responsesError) throw responsesError;
      responsesByInviteId = new Map(responses.map(row => [row.invitation_id, row]));
    } catch (error) {
      console.error('list responses failed:', error);
      return res.status(500).json({ error: toClientError(error) });
    }
  }

  const rows = invitations.map(inv => {
    const response = responsesByInviteId.get(inv.id) || {};
    return {
      ...inv,
      food: response.food || '',
      place: response.place || '',
      time: response.time || '',
      reply: response.reply || null,
      response_message: response.message || '',
      responded_at: response.created_at || null
    };
  });

  res.json(rows);
});

// API: 获取单个邀请
app.get('/api/invitations/:id', async (req, res) => {
  try {
    const { data: inv, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!inv) return res.status(404).json({ error: '邀请不存在' });
    res.json(inv);
  } catch (error) {
    console.error('get invitation failed:', error);
    return res.status(500).json({ error: toClientError(error) });
  }
});

// API: 提交回应
app.post('/api/responses', async (req, res) => {
  const { invitation_id, food, place, time, message, reply } = req.body;
  if (!invitation_id) return res.status(400).json({ error: '缺少邀请 ID' });

  try {
    const { data: inv, error: invitationError } = await supabase
      .from('invitations')
      .select('id')
      .eq('id', invitation_id)
      .maybeSingle();

    if (invitationError) throw invitationError;
    if (!inv) return res.status(404).json({ error: '邀请不存在' });

    const { data: existing, error: existingError } = await supabase
      .from('responses')
      .select('id')
      .eq('invitation_id', invitation_id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return res.status(400).json({ error: '已经回应过了' });

    const { error: insertError } = await supabase
      .from('responses')
      .insert({
        invitation_id,
        food: food || '',
        place: place || '',
        time: time || '',
        message: message || '',
        reply: reply || 'accept'
      });

    if (insertError) {
      const status = insertError.code === '23505' ? 400 : 500;
      return res.status(status).json({ error: toClientError(insertError) });
    }

    const { error: updateError } = await supabase
      .from('invitations')
      .update({ status: 'responded' })
      .eq('id', invitation_id);

    if (updateError) {
      console.error('update invitation status failed:', updateError);
      return res.status(500).json({ error: toClientError(updateError) });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('response submission failed:', error);
    return res.status(500).json({ error: toClientError(error) });
  }
});

// API: 获取回应
app.get('/api/responses/:invitationId', async (req, res) => {
  try {
    const { data: resp, error } = await supabase
      .from('responses')
      .select('*')
      .eq('invitation_id', req.params.invitationId)
      .maybeSingle();

    if (error) throw error;
    res.json(resp || null);
  } catch (error) {
    console.error('get response failed:', error);
    return res.status(500).json({ error: toClientError(error) });
  }
});

// ── 404 兜底 ──
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ 服务器已启动: http://localhost:${PORT}`);
  console.log(`  打开 http://localhost:${PORT}/index.html 创建邀请`);
});
