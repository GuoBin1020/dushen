#!/usr/bin/env python3
"""Pack the site into one HTML file (CSS and scripts inlined), handy for sending to friends.

  python3 tools/bundle.py                      -> ../赌神智慧树.html next to the project folder
  python3 tools/bundle.py --artifact OUT.html  -> page body only, without PeerJS or home-screen tags
"""
import re, sys, pathlib, json, base64

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIMIT = 6 * 1024 * 1024  # a single file bigger than this is too heavy to send around
MIME = {'.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg'}

# At startup every data URI becomes a short blob: URL, so each card's inline style stays small.
# If the browser refuses (no Blob / createObjectURL), the data URI stays and still works.
UNPACK = '''(function(){var d=window.ASSET_DATA;for(var k in d){try{var m=/^data:([^;]+);base64,(.*)$/.exec(d[k]),b=atob(m[2]),u=new Uint8Array(b.length);
for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);d[k]=URL.createObjectURL(new Blob([u],{type:m[1]}))}catch(e){}}})();'''

def asset_script():
    data = {}
    for f in sorted((ROOT / 'assets').rglob('*')):
        if f.suffix in MIME:
            data[f.relative_to(ROOT / 'assets').as_posix()] = f'data:{MIME[f.suffix]};base64,' + base64.b64encode(f.read_bytes()).decode()
    return '<script>/* assets */\nwindow.ASSET_DATA=' + json.dumps(data, separators=(',', ':')) + ';\n' + UNPACK + '</script>\n'

def inline(html, artifact):
    def css(m):
        return '<style>\n' + (ROOT / m.group(1)).read_text(encoding='utf-8') + '</style>'
    def js(m):
        path = m.group(1)
        if artifact and path.startswith('js/vendor/'):
            return ''  # the artifact viewer cannot use WebRTC, so multiplayer code stays but PeerJS is left out
        src = (ROOT / path).read_text(encoding='utf-8')
        if '</script' in src.lower():
            sys.exit(f'{path} contains "</script" and cannot be inlined')
        return f'<script>/* {path} */\n{src}</script>'
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    i = html.index('<script>')  # before every other script, so assets exist before anything renders
    html = html[:i] + asset_script() + html[i:]
    # home-screen files are not next to a single file, so drop the tags that point at them
    html = re.sub(r'<link rel="(?:manifest|apple-touch-icon)"[^>]*>\n?', '', html)
    return html

def check_size(page):
    n = len(page.encode('utf-8'))
    if n > LIMIT:
        sys.exit(f'single file is {n / 1048576:.2f}MB, over the {LIMIT // 1048576}MB limit')
    print(f'size {n / 1048576:.2f}MB')

def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    if len(sys.argv) >= 3 and sys.argv[1] == '--artifact':
        out = inline(html, True)
        head = re.search(r'<head>(.*?)</head>', out, re.S).group(1)
        keep = '\n'.join(re.findall(r'<title>.*?</title>|<link rel="(?:icon|preconnect|stylesheet)"[^>]*>|<style>.*?</style>', head, re.S))
        body = re.search(r'<body>(.*)</body>', out, re.S).group(1)
        page = keep.replace('</title>', '</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1) + '\n' + body.strip() + '\n'
        check_size(page)
        pathlib.Path(sys.argv[2]).write_text(page, encoding='utf-8')
        print('artifact page ->', sys.argv[2])
    else:
        target = ROOT.parent / '赌神智慧树.html'
        page = inline(html, False)
        check_size(page)
        target.write_text(page, encoding='utf-8')
        print('single file ->', target)

if __name__ == '__main__':
    main()
