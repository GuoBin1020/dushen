#!/usr/bin/env python3
"""Pack the site into one HTML file (CSS and scripts inlined), handy for sending to friends.

  python3 tools/bundle.py                      -> ../赌神智慧树.html next to the project folder
  python3 tools/bundle.py --artifact OUT.html  -> page body only, without PeerJS or home-screen tags
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

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
    # home-screen files are not next to a single file, so drop the tags that point at them
    html = re.sub(r'<link rel="(?:manifest|apple-touch-icon)"[^>]*>\n?', '', html)
    return html

def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    if len(sys.argv) >= 3 and sys.argv[1] == '--artifact':
        out = inline(html, True)
        head = re.search(r'<head>(.*?)</head>', out, re.S).group(1)
        keep = '\n'.join(re.findall(r'<title>.*?</title>|<link rel="(?:icon|preconnect|stylesheet)"[^>]*>|<style>.*?</style>', head, re.S))
        body = re.search(r'<body>(.*)</body>', out, re.S).group(1)
        page = keep.replace('</title>', '</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1) + '\n' + body.strip() + '\n'
        pathlib.Path(sys.argv[2]).write_text(page, encoding='utf-8')
        print('artifact page ->', sys.argv[2])
    else:
        target = ROOT.parent / '赌神智慧树.html'
        target.write_text(inline(html, False), encoding='utf-8')
        print('single file ->', target)

if __name__ == '__main__':
    main()
