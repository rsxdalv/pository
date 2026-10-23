#!/usr/bin/env bash
# One-time server setup for Authelia SSO on riga.us.to. Review, then run as root.
# Adds a 2nd Authelia cookie domain (ttswebui.com, portal sso.ttswebui.com), access rules,
# the portal vhost + cert, and a shared secret for the pository backend. Backs up what it edits.
# It does NOT touch the pository.ttswebui.com vhost - apply pository.ttswebui.com.sso-locations.conf
# only after the SSO-capable release is deployed.
set -euo pipefail
TS=$(date +%Y%m%d%H%M%S)

cp -p /etc/authelia/configuration.yml /etc/authelia/configuration.yml.bak.$TS
python3 - <<'EOF'
p = "/etc/authelia/configuration.yml"
s = open(p).read()
assert "sso.ttswebui.com" not in s, "already configured"
s = s.replace("""  - domain: sso.dev.ttswebui.com
    policy: bypass
""", """  - domain: sso.dev.ttswebui.com
    policy: bypass
  - domain: sso.ttswebui.com
    policy: bypass
  - domain: pository.ttswebui.com
    policy: two_factor
    subject: group:admins
""", 1)
s = s.replace("""    remember_me: 30d
    same_site: lax
""", """    remember_me: 30d
    same_site: lax
  - name: authelia_session_root
    domain: ttswebui.com
    authelia_url: https://sso.ttswebui.com
    expiration: 1h
    inactivity: 5m
    remember_me: 30d
    same_site: lax
""", 1)
open(p, "w").write(s)
EOF
if ! authelia validate-config --config /etc/authelia/configuration.yml; then
  cp -p /etc/authelia/configuration.yml.bak.$TS /etc/authelia/configuration.yml
  echo "validation failed - rolled back"; exit 1
fi

# Portal vhost: HTTP first so certbot can issue the cert
cat > /etc/nginx/sites-available/sso.ttswebui.com <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name sso.ttswebui.com;
    location / { return 301 https://$host$request_uri; }
}
EOF
ln -sf /etc/nginx/sites-available/sso.ttswebui.com /etc/nginx/sites-enabled/sso.ttswebui.com
nginx -t && systemctl reload nginx
certbot certonly --nginx -d sso.ttswebui.com --non-interactive --agree-tos

cat > /etc/nginx/sites-available/sso.ttswebui.com <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name sso.ttswebui.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name sso.ttswebui.com;

    ssl_certificate /etc/letsencrypt/live/sso.ttswebui.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sso.ttswebui.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 2M;

    location / {
        proxy_pass http://127.0.0.1:9091;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Forwarded-URI $request_uri;
        proxy_buffer_size 4k;
        proxy_buffers 4 4k;
    }
}
EOF

# Same forward-auth snippet as the dev domain, but redirecting to the new portal
sed 's#https://sso.dev.ttswebui.com/#https://sso.ttswebui.com/#' \
  /etc/nginx/snippets/authelia-authrequest.conf > /etc/nginx/snippets/authelia-authrequest-root.conf

# Shared secret nginx -> pository backend (never printed)
SECRET=$(openssl rand -hex 32)
umask 027
printf 'proxy_set_header X-Pository-Sso-Secret "%s";\n' "$SECRET" > /etc/nginx/snippets/pository-sso-secret.conf
chgrp www-data /etc/nginx/snippets/pository-sso-secret.conf 2>/dev/null || true
cp -p /etc/default/pository /etc/default/pository.bak.$TS
grep -q POSITORY_SSO_SECRET /etc/default/pository || printf '\nPOSITORY_SSO_SECRET=%s\n' "$SECRET" >> /etc/default/pository

nginx -t && systemctl reload nginx
systemctl restart authelia
sleep 3
systemctl is-active authelia
curl -s -o /dev/null -w "sso.ttswebui.com: %{http_code}\n" https://sso.ttswebui.com/
curl -s -o /dev/null -w "sso.dev.ttswebui.com: %{http_code}\n" https://sso.dev.ttswebui.com/
