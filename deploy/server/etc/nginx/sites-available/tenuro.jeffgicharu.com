# Tenuro: tenuro.jeffgicharu.com
# Cloudflare (proxied) -> nginx -> the active app slot on 127.0.0.1:9000 (blue) or :9001 (green).
# The active slot lives in /etc/nginx/tenuro/active-slot.conf, rewritten only by tenuro-activate.

# Rate limiting. Requests from loopback get an empty key and are never limited.
# $remote_addr here is the visitor's address, restored from CF-Connecting-IP below.
geo $tenuro_is_local {
    default         0;
    127.0.0.1/32    1;
    ::1/128         1;
}
map $tenuro_is_local $tenuro_limit_key {
    1   "";
    0   $binary_remote_addr;
}
limit_req_zone $tenuro_limit_key zone=tenuro_app:10m     rate=20r/s;
limit_req_zone $tenuro_limit_key zone=tenuro_static:10m  rate=60r/s;
limit_req_zone $tenuro_limit_key zone=tenuro_signin:1m   rate=10r/m;
limit_req_zone $tenuro_limit_key zone=tenuro_upload:1m   rate=1r/s;
limit_req_zone $tenuro_limit_key zone=tenuro_beacon:1m   rate=2r/s;
limit_req_zone $tenuro_limit_key zone=tenuro_report:1m   rate=1r/s;

server {
    listen 80;
    listen [::]:80;
    server_name tenuro.jeffgicharu.com;
    access_log /var/log/nginx/tenuro.access.log;
    error_log  /var/log/nginx/tenuro.error.log warn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name tenuro.jeffgicharu.com;

    ssl_certificate     /etc/ssl/cloudflare/jeffgicharu.com.pem;
    ssl_certificate_key /etc/ssl/cloudflare/jeffgicharu.com.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Cloudflare ranges from https://www.cloudflare.com/ips-v4 and /ips-v6, fetched 2026-11-02.
    real_ip_header CF-Connecting-IP;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2a06:98c0::/29;
    set_real_ip_from 2c0f:f248::/32;

    include /etc/nginx/tenuro/active-slot.conf;     # sets $tenuro_slot and $tenuro_port

    access_log /var/log/nginx/tenuro.access.log;
    error_log  /var/log/nginx/tenuro.error.log warn;
    server_tokens off;
    client_max_body_size 2m;                        # raised to 12m on /api/uploads only
    limit_req_status 429;

    root /srv/tenuro/slots/$tenuro_slot/public;

    # Cloudflare shows this page instead of its own when the app is down.
    error_page 502 503 504 =503 /unavailable.html;
    location = /unavailable.html {
        root /srv/tenuro/fallback;
        internal;
        add_header Retry-After 120 always;
        add_header Cache-Control "no-store" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Content-Security-Policy "default-src 'none'; style-src 'sha256-OQg7wYvjEj4pXiCDHbMSxTRYUVU5i3T6BjgSM8nO6ck='; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
    }

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Connection "";
    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;

    # Hashed JS, CSS and fonts from the last three releases, so open tabs survive a deploy.
    location /assets/ {
        root /srv/tenuro;
        try_files $uri =404;
        limit_req zone=tenuro_static burst=200 nodelay;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cross-Origin-Resource-Policy same-origin always;
    }

    # Unhashed public files: images, fonts, the pdf.js worker, robots.txt.
    location /static/ {
        try_files $uri =404;
        limit_req zone=tenuro_static burst=100 nodelay;
        add_header Cache-Control "public, max-age=86400" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cross-Origin-Resource-Policy same-origin always;
    }

    location = /robots.txt {
        try_files /static/robots.txt =404;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

    # The component library. Storybook's preview runs in a same-origin frame and needs inline
    # styles, so it gets its own policy, scoped to this path only.
    location /storybook/ {
        try_files $uri $uri/index.html =404;
        limit_req zone=tenuro_static burst=100 nodelay;
        add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'; object-src 'none'" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "public, max-age=300" always;
    }

    # Sign-in (POST) creates sessions and sandboxes: a tight per-client limit on top of the
    # app's own daily cap.
    # In the proxied locations below, nginx sets X-Robots-Tag itself (and hides the app's copy),
    # so its own 413 and 429 responses carry noindex too.
    location = /api/session {
        limit_req zone=tenuro_signin burst=5 nodelay;
        client_max_body_size 4k;
        proxy_hide_header X-Robots-Tag;
        add_header X-Robots-Tag "noindex, nofollow" always;
        proxy_pass http://127.0.0.1:$tenuro_port;
    }

    location = /api/uploads {
        limit_req zone=tenuro_upload burst=3 nodelay;
        client_max_body_size 12m;                   # the app caps each file at 10 MB
        proxy_request_buffering on;
        proxy_read_timeout 60s;
        proxy_hide_header X-Robots-Tag;
        add_header X-Robots-Tag "noindex, nofollow" always;
        proxy_pass http://127.0.0.1:$tenuro_port;
    }

    location = /api/vitals {
        limit_req zone=tenuro_beacon burst=10 nodelay;
        client_max_body_size 16k;
        proxy_hide_header X-Robots-Tag;
        add_header X-Robots-Tag "noindex, nofollow" always;
        proxy_pass http://127.0.0.1:$tenuro_port;
    }

    location = /api/csp-report {
        limit_req zone=tenuro_report burst=5 nodelay;
        client_max_body_size 16k;
        proxy_hide_header X-Robots-Tag;
        add_header X-Robots-Tag "noindex, nofollow" always;
        proxy_pass http://127.0.0.1:$tenuro_port;
    }

    location /api/ {
        limit_req zone=tenuro_app burst=40 nodelay;
        proxy_buffering off;                        # CSV and Excel exports stream
        proxy_read_timeout 60s;
        proxy_hide_header X-Robots-Tag;
        add_header X-Robots-Tag "noindex, nofollow" always;
        proxy_pass http://127.0.0.1:$tenuro_port;
    }

    # /graphql and every page route. The app sends the other security headers and renders
    # index.html itself so each response carries a fresh CSP nonce.
    location / {
        limit_req zone=tenuro_app burst=40 nodelay;
        proxy_hide_header X-Robots-Tag;
        add_header X-Robots-Tag "noindex, nofollow" always;
        proxy_pass http://127.0.0.1:$tenuro_port;
    }
}
