// GitHub sign-in for Emmy's editor at /admin, as a Vercel function.
//
// The whole flow happens in one tab — no popups — which is what makes it
// reliable on iPhones (Safari breaks the popup-to-opener handoff that most
// CMS logins rely on):
//
//   1. /admin sends the browser to /api/auth
//   2. /api/auth redirects to GitHub to ask permission
//   3. GitHub sends the browser back to /api/auth?code=...
//   4. we trade the code for an access token, stash it in localStorage
//      (same origin as /admin), and send the browser back to /admin — now
//      signed in.
//
// One-time setup:
//   1. GitHub OAuth App  (https://github.com/settings/developers)
//        Authorization callback URL: https://www.emmyfreed.com/api/auth
//   2. Vercel env vars: OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET

const OAUTH_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const OAUTH_TOKEN = 'https://github.com/login/oauth/access_token';

export default async function handler(req, res) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res
      .status(500)
      .send(
        'Sign-in is not configured. Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET ' +
          'on the Vercel deployment — see README.md.'
      );
    return;
  }

  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth`;

  const { code, error } = req.query;

  // Step 1: no code yet — bounce the browser to GitHub to ask permission.
  if (!code && !error) {
    const url = new URL(OAUTH_AUTHORIZE);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'public_repo'); // repo is public; this is all we need
    res.writeHead(302, { Location: url.toString() });
    res.end();
    return;
  }

  if (error) return finish(res, { error: String(error) });

  // Step 2: GitHub sent us back with a code — trade it for an access token.
  try {
    const tokenRes = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await tokenRes.json();
    if (data.error) return finish(res, { error: data.error_description || data.error });
    if (!data.access_token) return finish(res, { error: 'GitHub did not return an access token.' });
    return finish(res, { token: data.access_token });
  } catch (err) {
    return finish(res, { error: err.message || 'Unknown error' });
  }
}

// Step 3: hand the token to /admin via localStorage (same origin) and redirect.
function finish(res, { token, error }) {
  const tokenJs = JSON.stringify(token || null);
  const errorJs = JSON.stringify(error || null);

  const html = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{font:18px/1.4 -apple-system,system-ui,sans-serif;margin:0;min-height:100vh;
display:flex;align-items:center;justify-content:center;text-align:center;padding:1.5rem;color:#3d3d5c}
a{color:#FF3D7F}</style></head>
<body><div>Signing you in…</div><script>
(function(){
  var token=${tokenJs}, error=${errorJs};
  if(error){
    document.body.innerHTML='<div>Sign-in didn\\u2019t work: '+error+'<br><br><a href="/admin">Try again</a></div>';
    return;
  }
  try{ localStorage.setItem('emmy-gh-token', token); }catch(e){}
  location.replace('/admin');
})();
</script></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(error ? 400 : 200).send(html);
}
