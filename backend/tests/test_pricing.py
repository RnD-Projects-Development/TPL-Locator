"""Unit tests for pricing validation and payloads."""

import unittest
from app.routers.price import PricePayload, _validate_currency
from fastapi import HTTPException


class TestPricingPayloads(unittest.TestCase):
    def test_default_currency_is_pkr(self):
        payload = PricePayload(price=1500.0)
        self.assertEqual(payload.currency, "PKR")
        self.assertEqual(payload.price, 1500.0)
        self.assertFalse(payload.apply_to_all)
        self.assertIsNone(payload.device_sn)

    def test_apply_to_all_payload(self):
        payload = PricePayload(price=2500.0, currency="pkr", apply_to_all=True)
        validated_curr = _validate_currency(payload.currency)
        self.assertEqual(validated_curr, "PKR")
        self.assertTrue(payload.apply_to_all)

    def test_device_specific_payload(self):
        payload = PricePayload(price=3500.0, currency="USD", device_sn="2UXqQ9kcr")
        self.assertEqual(payload.device_sn, "2UXqQ9kcr")
        self.assertEqual(_validate_currency(payload.currency), "USD")

    def test_invalid_currency_raises_400(self):
        with self.assertRaises(HTTPException):
            _validate_currency("TOOLONG")

        with self.assertRaises(HTTPException):
            _validate_currency("12$")

        with self.assertRaises(HTTPException):
            _validate_currency("US")

    def test_valid_currencies(self):
        self.assertEqual(_validate_currency("pkr"), "PKR")
        self.assertEqual(_validate_currency("usd"), "USD")
        self.assertEqual(_validate_currency("eur"), "EUR")
        self.assertEqual(_validate_currency("gbp"), "GBP")
        self.assertEqual(_validate_currency(None), "PKR")

    def test_negative_price_rejected(self):
        with self.assertRaises(Exception):
            PricePayload(price=-10.0)


if __name__ == "__main__":
    unittest.main()
