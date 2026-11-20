import nodemailer from "nodemailer";
import { v7 as uuid } from "uuid";
import type { Mailer } from "@/ports";
import type { Logger } from "@/lib/logger";
import type { Db } from "@/adapters/postgres/db";
import { devMailbox } from "@/adapters/postgres/schema";

/** Dev/test: nothing leaves the machine. Mail is logged (without the body) and stored for /dev/mailbox. */
export class DevMailer implements Mailer {
  constructor(private readonly db: Db, private readonly logger: Pick<Logger, "info">) {}
  async send(msg: { to: string; subject: string; text: string }) {
    await this.db.insert(devMailbox).values({ id: uuid(), to: msg.to, subject: msg.subject, body: msg.text });
    this.logger.info({ event: "mail.dev", subject: msg.subject }, "dev mail stored — open /dev/mailbox");
  }
}

/** Production: plain SMTP (any provider). Credentials come from SMTP_URL in the secret store. */
export class SmtpMailer implements Mailer {
  private readonly transport;
  constructor(smtpUrl: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }
  async send(msg: { to: string; subject: string; text: string }) {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text });
  }
}
