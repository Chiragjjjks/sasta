"""Check the final APK manifest, decoded by `apkanalyzer manifest print app.apk`.

Run against the packaged artifact, since dependencies can add permissions and services
which do not appear in app.json or the app's source manifest.
"""
import sys
import xml.etree.ElementTree as ET

ANDROID = '{http://schemas.android.com/apk/res/android}'
ALLOWED = {
    'android.permission.INTERNET',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'app.sasta.android.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
}
SENSITIVE_SERVICES = {
    'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
    'android.permission.BIND_ACCESSIBILITY_SERVICE',
    'android.service.notification.NotificationListenerService',
    'android.accessibilityservice.AccessibilityService',
    'expo.modules.sastanative.OtpListenerService',
}


def check(manifest):
    if manifest.tag != 'manifest' or manifest.get('package') != 'app.sasta.android':
        raise ValueError('Expected the decoded Sasta APK manifest')
    permissions = {
        node.get(ANDROID + 'name', '') for node in manifest
        if node.tag in {'uses-permission', 'uses-permission-sdk-23'}
    }
    unexpected = permissions - ALLOWED
    if unexpected:
        raise ValueError('Unexpected APK permissions: ' + ', '.join(sorted(unexpected)))
    for node in manifest.iter():
        if SENSITIVE_SERVICES.intersection(node.attrib.values()):
            raise ValueError('Notification-reading or accessibility service found in APK')
    application = manifest.find('application')
    if application is None:
        raise ValueError('Missing application in APK manifest')
    for flag in ['debuggable', 'testOnly']:
        if application.get(ANDROID + flag, 'false') != 'false':
            raise ValueError('Release APK must not be ' + flag)
    return sorted(permissions)


if __name__ == '__main__':
    try:
        permissions = check(ET.parse(sys.argv[1]).getroot())
    except (ValueError, ET.ParseError, OSError, IndexError) as error:
        sys.exit('APK manifest check failed: ' + str(error))
    print('PASS: release APK has only expected permissions; no notification-reading or accessibility service.')
    print('\n'.join(permissions))
