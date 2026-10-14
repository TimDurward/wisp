#include <cstdio>

extern "C" int frameworkValue();

int main() { std::printf("%d\n", frameworkValue()); }
