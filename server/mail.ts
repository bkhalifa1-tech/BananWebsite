import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  url: string;
  purpose: "verify" | "reset";
};
export type Mailer = {
  delivery: "local" | "email" | "unavailable";
  send: (message: MailMessage) => Promise<void>;
};
export function localMailer(directory: string): Mailer {
  return {
    delivery: "local",
    async send(message) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        join(directory, `${Date.now()}-${randomUUID()}.json`),
        JSON.stringify(message, null, 2),
        { mode: 0o600 },
      );
    },
  };
}
export function resendMailer(key: string, from: string): Mailer {
  return {
    delivery: "email",
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Email delivery failed.");
    },
  };
}
export function configuredMailer(production: boolean): Mailer {
  if (process.env.MAIL_DELIVERY === "local") {
    if (production)
      throw new Error("Local email delivery is allowed only in development.");
    return localMailer(process.env.MAIL_DIRECTORY ?? ".data/mail");
  }
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM)
    return resendMailer(process.env.RESEND_API_KEY, process.env.MAIL_FROM);
  if (!production)
    return localMailer(process.env.MAIL_DIRECTORY ?? ".data/mail");
  return {
    delivery: "unavailable",
    async send() {
      throw new Error("Email delivery is not configured.");
    },
  };
}
