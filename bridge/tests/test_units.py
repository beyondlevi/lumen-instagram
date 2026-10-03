import pytest

from lumen_ig_bridge import config as config_module
from lumen_ig_bridge import voice


def test_waveform_resamples_to_70_bars_never_flat():
    bars = voice.waveform([0.0, 0.5, 1.0, 0.25] * 30)
    assert len(bars) == 70
    assert min(bars) >= 0.05 and max(bars) == 1.0
    assert voice.waveform([]) is None
    assert voice.waveform(None) is None
    assert len(voice.waveform([0.2])) == 70


def test_config_needs_a_long_key():
    with pytest.raises(config_module.ConfigError):
        config_module.load({"BRIDGE_KEY": "short"})
    loaded = config_module.load({
        "BRIDGE_KEY": "k" * 32, "IG_TIMEZONE_OFFSET": "-10800", "IG_LOCALE": "pt_BR", "BRIDGE_PORT": "9000",
    })
    assert loaded.timezone_offset == -10800 and loaded.locale == "pt_BR" and loaded.port == 9000
    assert loaded.sessionid is None and str(loaded.session_file) == "data/session.json"
    with pytest.raises(config_module.ConfigError):
        config_module.load({"BRIDGE_KEY": "k" * 32, "IG_TIMEZONE_OFFSET": "brazil"})


class _Client:
    """Just enough of instagrapi's Client for password_login."""

    def __init__(self, two_factor=False):
        self.two_factor = two_factor
        self.logins = []
        self.challenge_code_handler = None

    def login(self, username, password, verification_code=""):
        from instagrapi.exceptions import TwoFactorRequired

        self.logins.append((username, password, verification_code))
        if self.two_factor and not verification_code:
            raise TwoFactorRequired("two_factor_required")
        return True

    def totp_generate_code(self, seed):
        return f"totp:{seed}"


def test_password_login_asks_for_the_two_factor_code():
    from lumen_ig_bridge.instagram import password_login

    client = _Client(two_factor=True)
    asked = []
    password_login(client, "levi", "secret", lambda question: asked.append(question) or " 123456 ")
    assert client.logins == [("levi", "secret", ""), ("levi", "secret", "123456")]
    assert asked == ["Two-factor code: "]
    assert client.challenge_code_handler("levi", "EMAIL") == " 123456 "


def test_password_login_uses_the_authenticator_secret():
    from lumen_ig_bridge.instagram import password_login

    client = _Client(two_factor=True)
    password_login(client, "levi", "secret", lambda question: "unused", totp_secret="ABC")
    assert client.logins[-1] == ("levi", "secret", "totp:ABC")


def test_config_reads_the_login_settings():
    loaded = config_module.load({"BRIDGE_KEY": "k" * 32, "IG_USERNAME": " levi ", "IG_PASSWORD": " pass ", "IG_TOTP_SECRET": "AB CD"})
    assert loaded.username == "levi" and loaded.password == " pass " and loaded.totp_secret == "ABCD"
