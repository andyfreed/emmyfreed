// GitHub OAuth proxy for Decap CMS, deployed as a Vercel serverless function.
//
// Decap opens /api/auth in a popup, this function redirects to GitHub,
// GitHub redirects back here with a code, we exchange it for a token,
// then post the token back to the opener window via window.postMessage.
//
// Setup (one-time):
//   1. Create a GitHub OAuth App at https://github.com/settings/developers
//      - Authorization callback URL: https://emmyfreed.com/api/auth
//   2. Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in Vercel env vars.

const OAUTH_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const OAUTH_TOKEN = 'https://github.com/login/oauth/access_token';

export default async function handler(req, res) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).send(
      'OAuth not configured. Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET ' +
        'on the Vercel deployment — see README.md.'
    );
    return;
  }

  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth`;

  const { code, error } = req.query;

  if (!code && !error) {
    const url = new URL(OAUTH_AUTHORIZE);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'repo,user');
    res.writeHead(302, { Location: url.toString() });
    res.end();
    return;
  }

  if (error) {
    return sendResult(res, { error: String(error) });
  }

  try {
    const tokenRes = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await tokenRes.json();
    if (data.error) return sendResult(res, { error: data.error });
    if (!data.access_token) return sendResult(res, { error: 'No access_token in response' });
    return sendResult(res, { token: data.access_token });
  } catch (err) {
    return sendResult(res, { error: err.message || 'Unknown error' });
  }
}

function sendResult(res, { token, error }) {
  const status = error ? 'error' : 'success';
  const payload = error ? error : JSON.stringify({ token, provider: 'github' });
  const message = `authorization:github:${status}:${payload}`;
  const messageJs = JSON.stringify(message);

  const html = `<!doctype html><html><body><script>
(function () {
  function receive(e) {
    window.removeEventListener('message', receive, false);
    window.opener.postMessage(${messageJs}, e.origin);
    window.close();
  }
  window.addEventListener('message', receive, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(error ? 400 : 200).send(html);
}
