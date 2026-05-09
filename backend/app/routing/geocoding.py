"""Geocoding de direcciones a coordenadas (lat, lon) vía OSMnx/Nominatim."""

from __future__ import annotations


def geocode_place(name: str, default_city: str = "Madrid, Spain") -> tuple[float, float, str]:
    """Convierte un texto libre en coordenadas (lat, lon).

    Si el texto no menciona Madrid/España, se le añade `default_city`
    para acotar la búsqueda a Madrid. Útil para que "Calle Valderrodrigo 31"
    se resuelva como "Calle Valderrodrigo 31, Madrid, Spain".

    Args:
        name: dirección o lugar a geocodificar.
        default_city: ciudad/país a añadir si el texto no la menciona.

    Returns:
        Tupla `(lat, lon, query_efectiva)`. La query es la cadena que se
        pasó realmente a Nominatim, útil para depurar resultados ambiguos.

    Raises:
        ValueError: si Nominatim no encuentra el lugar.
    """
    import osmnx as ox  # lazy: osmnx tarda en importar

    n = name.lower()
    if any(token in n for token in ("madrid", "spain", "españa")):
        query = name
    else:
        query = f"{name}, {default_city}"

    try:
        lat, lon = ox.geocode(query)
    except Exception as e:
        raise ValueError(f"No se pudo geocodificar {name!r}: {e}") from e

    return float(lat), float(lon), query
