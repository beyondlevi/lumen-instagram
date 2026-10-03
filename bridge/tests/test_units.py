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
