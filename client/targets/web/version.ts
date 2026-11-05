/**
 * The injected client version, substituted at build time.
 *
 * The extension package has its own shell version. This value lets the running
 * client report the version of the code it actually executes, even when the
 * shell has not changed.
 */
declare const __YAPMOD_CLIENT_VERSION__: string;

export const CLIENT_VERSION = __YAPMOD_CLIENT_VERSION__;
