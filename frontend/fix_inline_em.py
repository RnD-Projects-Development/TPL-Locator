import re

files = [
    r'C:\Users\Test-August2023\Downloads\TPL-Locator\frontend\src\pages\FieldStaffDashboard.jsx'
]

def px_to_em_replacer(match):
    val = float(match.group(1))
    if val == 0:
        return '0'
    return f"'{val / 16:g}em'"

def raw_number_replacer(match):
    prop = match.group(1)
    val = float(match.group(2))
    if val == 0 or prop in ['fontWeight', 'opacity', 'lineHeight', 'flex', 'zIndex']:
        return match.group(0) # don't convert weights/opacity
    return f"{prop}: '{val / 16:g}em'"

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace '12px' with '0.75em'
    content = re.sub(r'\'(\d+(?:\.\d+)?)px\'', px_to_em_replacer, content)
    content = re.sub(r'\"(\d+(?:\.\d+)?)px\"', px_to_em_replacer, content)
    
    # Replace fontSize: 12 with fontSize: '0.75em'
    content = re.sub(r'(fontSize|padding|margin|marginBottom|marginTop|marginLeft|marginRight|paddingTop|paddingBottom|paddingLeft|paddingRight|borderRadius|gap|width|height|minWidth|minHeight|maxWidth|maxHeight):\s*(\d+(?:\.\d+)?)', raw_number_replacer, content)

    # Some complex strings like padding: '12px 14px' are handled by px_to_em_replacer if they were single, but we need to handle mixed.
    def mixed_px_replacer(match):
        def repl(m):
            v = float(m.group(1))
            return '0' if v == 0 else f'{v/16:g}em'
        res = re.sub(r'(\d+(?:\.\d+)?)px', repl, match.group(0))
        return res

    content = re.sub(r'(?:padding|margin|border|borderRadius|boxShadow|backgroundPosition):\s*[\'\"][^\'\"]+[\'\"]', mixed_px_replacer, content)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print('Done!')
