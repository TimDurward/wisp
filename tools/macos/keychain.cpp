// Build-only helper. The signing-keystore password arrives on stdin, never argv.
#include <Security/Security.h>
#include <cstring>
#include <iostream>
#include <string_view>
int main(int argc, char** argv) {
    if (argc != 3) {
        return 2;
    }
    SecKeychainSetUserInteractionAllowed(false);
    SecKeychainRef keychain = nullptr;
    OSStatus status = SecKeychainOpen(argv[2], &keychain);
    if (status == errSecSuccess) {
        if (std::string_view(argv[1]) == "unlock") {
            char password[256] = {};
            std::cin.getline(password, sizeof(password));
            status = std::cin.fail()
                         ? errSecParam
                         : SecKeychainUnlock(keychain, static_cast<UInt32>(std::strlen(password)),
                                             password, true);
        } else if (std::string_view(argv[1]) == "lock") {
            status = SecKeychainLock(keychain);
        } else {
            status = errSecParam;
        }
    }
    if (keychain) {
        CFRelease(keychain);
    }
    if (status != errSecSuccess) {
        std::cerr << "Signing keystore status: " << status << '\n';
    }
    return status == errSecSuccess ? 0 : 1;
}
