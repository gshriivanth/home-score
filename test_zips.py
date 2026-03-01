import asyncio
import sys
import os

from backend.geo import lookup_zips_for_city

async def main():
    zips = await lookup_zips_for_city("Irvine", "CA")
    print(f"Irvine CA ZIPs: {zips}")

    zips2 = await lookup_zips_for_city("Irvine", "ca")
    print(f"Irvine ca ZIPs: {zips2}")

asyncio.run(main())
