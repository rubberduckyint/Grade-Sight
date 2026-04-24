"""External service abstraction layer.

Wraps third-party APIs (Stripe today; Claude + S3 in future specs) so
the surrounding code calls thin, audit-logged helpers rather than the
raw SDKs.
"""
