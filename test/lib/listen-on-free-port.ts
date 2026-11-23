import type { Server } from 'http';
import type { AddressInfo } from 'net';

/** Binds the server to an OS-assigned port on the named host and returns once it is listening, so the port is never guessed ahead of the bind. */
export async function listenOnFreePort(server: Server, host: string): Promise<{ server: Server; port: number }> {
  server.listen(0, host);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { server, port: (server.address() as AddressInfo).port };
}
