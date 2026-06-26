"""Send transactional email via SMTP (Exchange / OWA-backed mailbox)."""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.dependencies import get_settings

logger = logging.getLogger(__name__)


def _smtp_settings() -> dict:
    settings = get_settings()
    return {
        "host": settings["smtp_host"],
        "port": settings["smtp_port"],
        "user": settings["smtp_user"],
        "from_email": settings["smtp_email"],
        "password": settings["smtp_password"],
        "use_tls": settings["smtp_use_tls"],
        "tls_insecure": settings["smtp_tls_insecure"],
    }


def _tls_context(*, insecure: bool) -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _send_plain_otp_email(*, to_email: str, otp: str, subject: str, intro: str, footer: str) -> None:
    cfg = _smtp_settings()
    if not cfg["user"] or not cfg["password"] or not cfg["from_email"]:
        raise RuntimeError("SMTP credentials are not configured")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = cfg["from_email"]
    message["To"] = to_email
    message.set_content(
        "\n".join(
            [
                "Hello,",
                "",
                intro,
                "",
                f"Your verification code is: {otp}",
                "",
                footer,
                "",
                "— TPL Trakker",
            ]
        )
    )

    tls_ctx = _tls_context(insecure=cfg["tls_insecure"])

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as server:
            server.ehlo()
            if cfg["use_tls"]:
                server.starttls(context=tls_ctx)
                server.ehlo()
            server.login(cfg["user"], cfg["password"])
            server.send_message(message)
    except Exception as exc:
        logger.exception("failed to send OTP email to=%s", to_email)
        raise RuntimeError(f"Failed to send email: {exc}") from exc

    logger.info("OTP email sent to=%s subject=%s", to_email, subject)


def send_otp_email(*, to_email: str, otp: str) -> None:
    """Send a one-time password for password reset."""
    _send_plain_otp_email(
        to_email=to_email,
        otp=otp,
        subject="TPL Trakker — Password Reset Code",
        intro="Use this code to reset your password.",
        footer="This code expires in a few minutes. If you did not request a reset, you can ignore this email.",
    )


def send_signup_verification_email(*, to_email: str, otp: str) -> None:
    """Send a one-time password to verify email during signup."""
    _send_plain_otp_email(
        to_email=to_email,
        otp=otp,
        subject="TPL Trakker — Email Verification Code",
        intro="Use this code to verify your email and complete signup.",
        footer="This code expires in a few minutes. If you did not create an account, you can ignore this email.",
    )
