"""Cliente de meteorología (Open-Meteo)."""

from app.weather.open_meteo_client import (
    OpenMeteoClient,
    WeatherFetchError,
    WeatherInfo,
    precip_to_lluvia_ord,
)

__all__ = [
    "OpenMeteoClient",
    "WeatherFetchError",
    "WeatherInfo",
    "precip_to_lluvia_ord",
]
