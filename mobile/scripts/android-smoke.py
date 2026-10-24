"""Exercise the signed, offline-capable APK with Android's real accessibility tree.
Run on a disposable, root-capable emulator: python3 scripts/android-smoke.py app.apk.
No platform accounts or OTPs are used. Synthetic data exists only in this emulator.
"""
import json
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape

APP = 'app.sasta.android'
OUT = Path('test-results')
OUT.mkdir(exist_ok=True)
APK = Path(sys.argv[1]).resolve()


def adb(*args, check=True):
    return subprocess.run(['adb', *args], check=check, capture_output=True, text=True, timeout=60).stdout.strip()


def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/sasta-ui.xml', check=False)
    data = adb('shell', 'cat', '/sdcard/sasta-ui.xml')
    (OUT / 'last-ui.xml').write_text(data)
    return list(ET.fromstring(data).iter('node'))


def find(label, timeout=20, contains=False):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for node in tree():
            for attr in ['content-desc', 'text']:
                value = node.get(attr, '')
                if (label in value if contains else label == value):
                    return node
        time.sleep(0.5)
    raise AssertionError(f'Element not found: {label}')


def tap(label, contains=False):
    node = find(label, contains=contains)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def shot(name):
    adb('shell', 'screencap', '-p', f'/sdcard/{name}.png')
    adb('pull', f'/sdcard/{name}.png', str(OUT / f'{name}.png'))


def launch():
    adb('shell', 'am', 'start', '-W', '-n', f'{APP}/.MainActivity')


def back():
    adb('shell', 'input', 'keyevent', '4')


def restart():
    adb('shell', 'am', 'force-stop', APP)
    launch()


def seed_previous_release():
    previous = OUT / 'previous.apk'
    subprocess.run(['curl', '-fL', '--retry', '3', '-o', str(previous),
                    'https://github.com/Chiragjjjks/sasta/releases/download/v0.3.2/Sasta-v0.3.2-android.apk'], check=True)
    adb('install', str(previous))
    launch()
    time.sleep(3)
    adb('shell', 'am', 'force-stop', APP)
    adb('root')
    adb('wait-for-device')
    now = int(time.time() * 1000)
    offer = dict(platform='blinkit', productId='smoke', title='Upgrade snack 100 g', price=20,
                 inStock=True, deepLink='https://blinkit.com', fetchedAt=now)
    cart = [dict(key='upgrade-test', brand='Test', variant='Upgrade snack', variantKey='raw:upgrade',
                 sizeGrams=100, query='upgrade snack', qty=1, offers=[offer], updatedAt=now)]
    lists = [dict(id='upgrade-test', name='Upgrade test list', emoji='🛒', items=[], createdAt=now, updatedAt=now)]
    values = {'sasta.lists': lists, 'sasta.cart': cart,
              'sasta.location': dict(label='Upgrade area', pincode='560010', lat=12.9915, lng=77.5544)}
    xml = '<?xml version="1.0" encoding="utf-8" standalone="yes"?><map>'
    xml += ''.join(f'<string name="{key}">{escape(json.dumps(value))}</string>' for key, value in values.items())
    xml += '</map>'
    prefs = OUT / 'CapacitorStorage.xml'
    prefs.write_text(xml)
    directory = f'/data/user/0/{APP}'
    owner = adb('shell', 'stat', '-c', '%u', directory)
    adb('shell', 'mkdir', '-p', f'{directory}/shared_prefs')
    destination = f'{directory}/shared_prefs/CapacitorStorage.xml'
    adb('push', str(prefs), destination)
    adb('shell', 'chown', f'{owner}:{owner}', destination)
    adb('shell', 'chmod', '600', destination)
    adb('shell', 'restorecon', '-R', directory)
    previous.unlink()


try:
    seed_previous_release()
    # An actual in-place update: Android enforces matching package, signature and versionCode.
    adb('install', '-r', str(APK))
    adb('logcat', '-c')
    launch()
    find('Search any product', timeout=45)
    find('Live now: Blinkit')
    find('Upgrade area', contains=True)
    assert any(n.get('class') == 'android.widget.EditText' for n in tree()), 'Search is not a native text input'
    shot('01-native-home')

    tap('Lists', contains=True)
    find('Your lists')
    tap('Upgrade test list', contains=True)
    find('This list is empty.', contains=True)
    back()
    tap('New list name')
    adb('shell', 'input', 'text', 'Smoke-list')
    tap('Create')
    find('Smoke-list', contains=True)
    back()
    find('Smoke-list', contains=True)
    time.sleep(1)
    restart()
    find('Search any product')
    tap('Lists', contains=True)
    find('Upgrade test list', contains=True)
    find('Smoke-list', contains=True)
    shot('02-persisted-lists')

    tap('Cart', contains=True)
    find('Your cart')
    find('Upgrade snack', contains=True)
    tap('More')
    find('2 items', contains=True)
    shot('03-migrated-cart')
    time.sleep(1)
    restart()
    find('Search any product')
    tap('Cart', contains=True)
    find('2 items', contains=True)

    tap('Account', contains=True)
    find('Connected apps')
    tap('Delivery location', contains=True) if False else tap('Upgrade area', contains=True)
    find('Save location')
    back()
    find('Connected apps')
    # Website sign-in must be cancellable even without completing an OTP.
    tap('Connect')
    find('Cancel sign-in')
    tap('Cancel sign-in')
    find('Connected apps')
    shot('04-account')

    tap('Search', contains=True)
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    tap('Search any product')
    adb('shell', 'input', 'text', 'lays')
    tap('Compare prices')
    find('No results this time', timeout=50)
    shot('05-offline-recovery')
    tap('Clear search')
    find('One search.')
    assert not any('Browser preview' in n.get('text', '') for n in tree())
    adb('shell', 'svc', 'wifi', 'enable')
    adb('shell', 'svc', 'data', 'enable')
    tap('Search any product')
    adb('shell', 'input', 'text', 'lays')
    tap('Compare prices')
    deadline = time.monotonic() + 50
    online_status = ''
    while time.monotonic() < deadline:
        labels = ' '.join(n.get('text', '') + ' ' + n.get('content-desc', '') for n in tree())
        match = re.search(r'\b\d+ products? from \d+ apps?', labels)
        if match:
            online_status = match.group()
            break
        time.sleep(1)
    assert online_status, 'Search remained stuck after restoring the network'
    (OUT / 'online-search.txt').write_text(online_status + '\nProvider availability is external; zero results are retained in the screenshot.\n')
    shot('06-network-restored')
    logs = adb('logcat', '-d')
    (OUT / 'logcat.txt').write_text(logs)
    assert 'FATAL EXCEPTION' not in logs and 'JavascriptException' not in logs, 'Native or JavaScript crash; see logcat'
    (OUT / 'result.txt').write_text('PASS: signed upgrade, native startup, list/cart/location migration, creation, persistence, quantity editing, navigation, sign-in cancellation, offline timeout and clear-search recovery.\n')
    print((OUT / 'result.txt').read_text())
except Exception:
    shot('failure')
    (OUT / 'logcat.txt').write_text(adb('logcat', '-d'))
    raise
finally:
    adb('shell', 'svc', 'wifi', 'enable', check=False)
    adb('shell', 'svc', 'data', 'enable', check=False)
