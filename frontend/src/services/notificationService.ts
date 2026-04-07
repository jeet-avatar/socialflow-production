/**
 * Global notification helper — dispatches to the bell icon in Dashboard.
 * Works from any component or service via the 'app-notification' custom event.
 */
export type NotifType = 'success' | 'error' | 'info' | 'warning';

export const notify = (
  title: string,
  message: string,
  type: NotifType = 'info',
): void => {
  globalThis.dispatchEvent(
    new CustomEvent('app-notification', { detail: { title, message, type } }),
  );
};
