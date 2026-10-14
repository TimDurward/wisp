#ifndef WISP_APPSHELL_H
#define WISP_APPSHELL_H
#include <QString>
namespace wisp {
int runApp(bool smoke, bool diagnostics, QString screenshot, QString dataDir, QString iconExport,
           QString capturePanel);
}

#endif
