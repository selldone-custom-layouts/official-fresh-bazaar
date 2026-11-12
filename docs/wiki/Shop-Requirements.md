# Shop Requirements

The bazaar is built from your shop's data. Nothing about Fresh Bazaar is written into the code. Here is what your data needs to look as it does on [bazaar.bigmart.me](https://bazaar.bigmart.me).

## Shop settings

| Setting | What to set | Why |
| --- | --- | --- |
| **Home** | The **Shop** page | `/` then opens the bazaar. With a Page Builder page as Home, the bazaar is only at `/shop`. |
| **Payment methods** | At least one, for your currency | So shoppers can pay |
| **Guest checkout** | Your choice | Without it, Add to basket asks shoppers to sign in, as in the standard storefront |
| **Currency, country, language** | Your market | Prices and texts. Persian and other right-to-left languages are supported. |

## Categories (stalls)

- Each **top-level category becomes a stall**, with its **title** and **image** on the sign. Give every top-level category a clear title and a square image.
- A large category spreads across neighbouring stalls under the same sign, as a big merchant would.
- Up to 24 stalls and 8 crates per stall are shown at once. The classic list view (one tap away) always shows everything.

## Products (crates)

- **Photo, price and unit** (kg, box, piece…). The chalkboard tag shows the price per unit.
- **The 3D model** is matched from the title, in English or Persian ("Red Apple", "سیب قرمز", "Mint"…). To choose it yourself, add a tag such as `3d:apple-green`, `3d:herbs-mint` or `3d:pumpkin`. A product with no matching model appears as a labelled package with its own photo.
- **Persian name:** put it in the product's second title to show it beneath the English name.
- **Variants, stock, discounts, description, specifications, pros and cons, brand, warranty and reviews** all appear in the inspector when they exist.

## Performance

The bazaar adapts its quality to the device (resolution, shadows, crowd size). A shop with a few hundred products is fine; the catalogue is paged in the background.
