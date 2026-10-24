# Amazon Now

Quick delivery only. An Amazon sign-in does not prove Now is accessible in that web session.

The adapter discovers an explicitly labelled Amazon Now entry in the session's homepage, then requires a store-specific search and a verified Now header. It rejects Fresh's `almBrandId=ctnow`, Fresh/grocery search aliases, ordinary marketplace searches and cards advertising hours/day delivery. A selected postcode mismatch requires delivery-area setup.

On 2026-10-24, the available web session exposed `/alm/storefront?almBrandId=ctnow` as Amazon Fresh. Running the production reader on that page returned `unavailable` and no prices. **A positive Amazon Now catalogue has not been verified.** The adapter is guarded discovery, not a claim of working Now access for every connected Amazon account.

Amazon's [Now announcement](https://www.aboutamazon.in/news/retail/amazon-now-india-ultra-fast-delivery) directs customers to the Now entry in its shopping app. Sasta reports unavailable when the account does not expose a usable Now web storefront; it does not fall back to Fresh or regular listings.
