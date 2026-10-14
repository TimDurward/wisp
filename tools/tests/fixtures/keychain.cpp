// Disposable-keychain fixture. Never queries the OAuth service or the login keychain.
#include <Security/Security.h>
#include <stdio.h>
#include <string.h>
#ifndef REVISION
#define REVISION 1
#endif
static CFMutableDictionaryRef query(SecKeychainRef keychain, CFStringRef service) {
    const void* chains[] = {keychain};
    CFArrayRef list = CFArrayCreate(NULL, chains, 1, &kCFTypeArrayCallBacks);
    CFMutableDictionaryRef result = CFDictionaryCreateMutable(
        NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFDictionarySetValue(result, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(result, kSecAttrService, service);
    CFDictionarySetValue(result, kSecAttrAccount, CFSTR("fixture"));
    CFDictionarySetValue(result, kSecMatchSearchList, list);
    CFRelease(list);
    return result;
}
static OSStatus add(SecKeychainRef keychain, CFStringRef service, CFDataRef data) {
    CFMutableDictionaryRef attributes = query(keychain, service);
    CFDictionaryRemoveValue(attributes, kSecMatchSearchList);
    CFDictionarySetValue(attributes, kSecUseKeychain, keychain);
    CFDictionarySetValue(attributes, kSecValueData, data);
    OSStatus status = SecItemAdd(attributes, NULL);
    CFRelease(attributes);
    return status;
}
int main(int argc, char** argv) {
    volatile int revision = REVISION;
    if (argc != 3 || revision < 1) {
        return 2;
    }
    SecKeychainSetUserInteractionAllowed(false);
    const char* password = "isolated-fixture-password";
    CFStringRef current = CFSTR("com.wisp.signing-continuity.fixture");
    CFStringRef legacy = CFSTR("com.wisp.signing-continuity.fixture.legacy");
    const char* value = "fixture-value";
    SecKeychainRef keychain = NULL;
    OSStatus status;
    if (strcmp(argv[2], "create") == 0) {
        status =
            SecKeychainCreate(argv[1], (UInt32)strlen(password), password, false, NULL, &keychain);
    } else {
        status = SecKeychainOpen(argv[1], &keychain);
    }
    if (status == errSecSuccess) {
        status = SecKeychainUnlock(keychain, (UInt32)strlen(password), password, true);
    }
    if (status == errSecSuccess && strcmp(argv[2], "create") == 0) {
        CFDataRef data = CFDataCreate(NULL, (const UInt8*)value, strlen(value));
        status = add(keychain, legacy, data);
        CFRelease(data);
    } else if (status == errSecSuccess && strcmp(argv[2], "delete") == 0) {
        status = SecKeychainDelete(keychain);
    } else if (status == errSecSuccess) {
        const bool migrating = strcmp(argv[2], "migrate") == 0;
        CFMutableDictionaryRef attributes =
            query(keychain, migrating || strcmp(argv[2], "read-legacy") == 0 ? legacy : current);
        CFDictionarySetValue(attributes, kSecReturnData, kCFBooleanTrue);
        CFTypeRef data = NULL;
        status = SecItemCopyMatching(attributes, &data);
        const char* expected = strcmp(argv[2], "read-refreshed") == 0 ? "fixture-renewed" : value;
        if (!status &&
            (CFDataGetLength(static_cast<CFDataRef>(data)) != strlen(expected) ||
             memcmp(CFDataGetBytePtr(static_cast<CFDataRef>(data)), expected, strlen(expected)))) {
            status = errSecDecode;
        }
        if (!status && migrating) {
            status = add(keychain, current, static_cast<CFDataRef>(data));
            // Wisp defers owner-protected legacy cleanup to explicit sign-out.
        }
        if (!status && strcmp(argv[2], "update") == 0) {
            CFDictionaryRemoveValue(attributes, kSecReturnData);
            CFDataRef renewed =
                CFDataCreate(NULL, (const UInt8*)"fixture-renewed", strlen("fixture-renewed"));
            const void *keys[] = {kSecValueData}, *values[] = {renewed};
            CFDictionaryRef update =
                CFDictionaryCreate(NULL, keys, values, 1, &kCFTypeDictionaryKeyCallBacks,
                                   &kCFTypeDictionaryValueCallBacks);
            status = SecItemUpdate(attributes, update);
            CFRelease(update);
            CFRelease(renewed);
        }
        if (data) {
            CFRelease(data);
        }
        CFRelease(attributes);
    }
    if (keychain) {
        SecKeychainLock(keychain);
        CFRelease(keychain);
    }
    printf("fixture operation status: %d\n", (int)status);
    return status == errSecSuccess ? 0 : 1;
}