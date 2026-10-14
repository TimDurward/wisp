extern "C" int dependencyValue();

extern "C" int frameworkValue() { return dependencyValue() + 2; }
