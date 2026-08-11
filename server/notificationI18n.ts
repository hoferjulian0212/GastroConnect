/**
 * Notification i18n resolution helper.
 *
 * Selects between a German base string and an optional Italian override based
 * on the recipient's stored language preference.  German is the platform
 * default and is always used as the fallback.
 */

export interface NotifI18n {
  title_it: string;
  message_it: string;
}

/**
 * Returns the title and message to store / dispatch for a notification,
 * localised to the recipient's language.
 *
 * @param recipientLang  The value of `users.language` for the recipient.
 * @param base           German (default) title and message strings.
 * @param i18n           Optional Italian overrides.  When absent the German
 *                       strings are used regardless of `recipientLang`.
 */
export function resolveNotifI18n(
  recipientLang: string | null | undefined,
  base: { title: string; message: string },
  i18n?: NotifI18n,
): { title: string; message: string } {
  if (i18n && recipientLang === "it") {
    return { title: i18n.title_it, message: i18n.message_it };
  }
  return { title: base.title, message: base.message };
}
