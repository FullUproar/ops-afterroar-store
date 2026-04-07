# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-overflow.spec.ts >> authenticated: mobile overflow checks >> mobile overflow - /dashboard/help
- Location: tests\mobile-overflow.spec.ts:32:9

# Error details

```
Error: /dashboard/help has 12 clipped buttons/links:
<button> "Register & Checkout11" overflows right by 28px
<button> "Inventory7" overflows right by 136px
<button> "TCG Singles6" overflows right by 268px
<button> "Customers4" overflows right by 387px
<button> "Events & Tournaments5" overflows right by 590px
<button> "Cafe & Food5" overflows right by 721px
<button> "Trade-Ins & Returns4" overflows right by 907px
<button> "Shipping & Fulfillment4" overflows right by 1103px
<button> "Marketplace & E-Commerce3" overflows right by 1346px
<button> "Reports & Intelligence6" overflows right by 1544px
<button> "Staff & Admin5" overflows right by 1683px
<button> "Troubleshooting5" overflows right by 1839px

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 12
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - main [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e8]:
          - generic [ref=e10]: Offline
          - generic [ref=e11]: Sales will queue locally
        - button "Notifications" [ref=e13]:
          - img [ref=e14]
      - generic [ref=e17]:
        - generic [ref=e19]:
          - button "Go back" [ref=e20]:
            - img [ref=e21]
          - heading "Help Center" [level=1] [ref=e23]
        - textbox "Search help articles..." [ref=e25]
        - generic [ref=e27]:
          - button "All70" [ref=e28]
          - button "Getting Started5" [ref=e29]
          - button "Register & Checkout11" [ref=e30]
          - button "Inventory7" [ref=e31]
          - button "TCG Singles6" [ref=e32]
          - button "Customers4" [ref=e33]
          - button "Events & Tournaments5" [ref=e34]
          - button "Cafe & Food5" [ref=e35]
          - button "Trade-Ins & Returns4" [ref=e36]
          - button "Shipping & Fulfillment4" [ref=e37]
          - button "Marketplace & E-Commerce3" [ref=e38]
          - button "Reports & Intelligence6" [ref=e39]
          - button "Staff & Admin5" [ref=e40]
          - button "Troubleshooting5" [ref=e41]
        - generic [ref=e42]:
          - heading "Popular" [level=2] [ref=e43]
          - generic [ref=e44]:
            - button "★ Your first sale Getting Started" [ref=e45]:
              - generic [ref=e46]: ★
              - generic [ref=e47]: Your first sale
              - generic [ref=e48]: Getting Started
            - button "★ Adding products to your catalog Getting Started" [ref=e49]:
              - generic [ref=e50]: ★
              - generic [ref=e51]: Adding products to your catalog
              - generic [ref=e52]: Getting Started
            - button "★ Card payments with Stripe Terminal Register & Checkout" [ref=e53]:
              - generic [ref=e54]: ★
              - generic [ref=e55]: Card payments with Stripe Terminal
              - generic [ref=e56]: Register & Checkout
            - button "★ Searching Scryfall, Pokemon, and Yu-Gi-Oh catalogs Inventory" [ref=e57]:
              - generic [ref=e58]: ★
              - generic [ref=e59]: Searching Scryfall, Pokemon, and Yu-Gi-Oh catalogs
              - generic [ref=e60]: Inventory
            - 'button "★ Loyalty points: earning, redeeming, and claiming Customers" [ref=e61]':
              - generic [ref=e62]: ★
              - generic [ref=e63]: "Loyalty points: earning, redeeming, and claiming"
              - generic [ref=e64]: Customers
        - generic [ref=e65]:
          - generic [ref=e66]:
            - heading "Getting Started" [level=2] [ref=e67]
            - generic [ref=e68]:
              - button "Your first sale register checkout quick start new store ▼" [ref=e70]:
                - generic [ref=e71]:
                  - text: Your first sale
                  - generic [ref=e72]:
                    - generic [ref=e73]: register
                    - generic [ref=e74]: checkout
                    - generic [ref=e75]: quick start
                    - generic [ref=e76]: new store
                - generic [ref=e77]: ▼
              - button "Adding products to your catalog products inventory catalog barcode ▼" [ref=e79]:
                - generic [ref=e80]:
                  - text: Adding products to your catalog
                  - generic [ref=e81]:
                    - generic [ref=e82]: products
                    - generic [ref=e83]: inventory
                    - generic [ref=e84]: catalog
                    - generic [ref=e85]: barcode
                - generic [ref=e86]: ▼
              - button "Setting up sales tax tax settings stripe tax configuration ▼" [ref=e88]:
                - generic [ref=e89]:
                  - text: Setting up sales tax
                  - generic [ref=e90]:
                    - generic [ref=e91]: tax
                    - generic [ref=e92]: settings
                    - generic [ref=e93]: stripe tax
                    - generic [ref=e94]: configuration
                - generic [ref=e95]: ▼
              - button "Onboarding wizard onboarding setup wizard new store ▼" [ref=e97]:
                - generic [ref=e98]:
                  - text: Onboarding wizard
                  - generic [ref=e99]:
                    - generic [ref=e100]: onboarding
                    - generic [ref=e101]: setup
                    - generic [ref=e102]: wizard
                    - generic [ref=e103]: new store
                - generic [ref=e104]: ▼
              - button "Loading demo data demo sample data testing onboarding ▼" [ref=e106]:
                - generic [ref=e107]:
                  - text: Loading demo data
                  - generic [ref=e108]:
                    - generic [ref=e109]: demo
                    - generic [ref=e110]: sample data
                    - generic [ref=e111]: testing
                    - generic [ref=e112]: onboarding
                - generic [ref=e113]: ▼
          - generic [ref=e114]:
            - heading "Register & Checkout" [level=2] [ref=e115]
            - generic [ref=e116]:
              - button "Processing a cash sale cash payment register checkout ▼" [ref=e118]:
                - generic [ref=e119]:
                  - text: Processing a cash sale
                  - generic [ref=e120]:
                    - generic [ref=e121]: cash
                    - generic [ref=e122]: payment
                    - generic [ref=e123]: register
                    - generic [ref=e124]: checkout
                - generic [ref=e125]: ▼
              - button "Card payments with Stripe Terminal card stripe terminal S710 ▼" [ref=e127]:
                - generic [ref=e128]:
                  - text: Card payments with Stripe Terminal
                  - generic [ref=e129]:
                    - generic [ref=e130]: card
                    - generic [ref=e131]: stripe
                    - generic [ref=e132]: terminal
                    - generic [ref=e133]: S710
                - generic [ref=e134]: ▼
              - button "Using the barcode scanner barcode scanner USB bluetooth ▼" [ref=e136]:
                - generic [ref=e137]:
                  - text: Using the barcode scanner
                  - generic [ref=e138]:
                    - generic [ref=e139]: barcode
                    - generic [ref=e140]: scanner
                    - generic [ref=e141]: USB
                    - generic [ref=e142]: bluetooth
                - generic [ref=e143]: ▼
              - button "Applying discounts discount percentage markdown promotion ▼" [ref=e145]:
                - generic [ref=e146]:
                  - text: Applying discounts
                  - generic [ref=e147]:
                    - generic [ref=e148]: discount
                    - generic [ref=e149]: percentage
                    - generic [ref=e150]: markdown
                    - generic [ref=e151]: promotion
                - generic [ref=e152]: ▼
              - button "Adding manual items manual custom item one-off service ▼" [ref=e154]:
                - generic [ref=e155]:
                  - text: Adding manual items
                  - generic [ref=e156]:
                    - generic [ref=e157]: manual
                    - generic [ref=e158]: custom item
                    - generic [ref=e159]: one-off
                    - generic [ref=e160]: service
                - generic [ref=e161]: ▼
              - button "Split tender payments split tender multiple payments partial ▼" [ref=e163]:
                - generic [ref=e164]:
                  - text: Split tender payments
                  - generic [ref=e165]:
                    - generic [ref=e166]: split
                    - generic [ref=e167]: tender
                    - generic [ref=e168]: multiple payments
                    - generic [ref=e169]: partial
                - generic [ref=e170]: ▼
              - button "Paying with store credit store credit credit ledger customer ▼" [ref=e172]:
                - generic [ref=e173]:
                  - text: Paying with store credit
                  - generic [ref=e174]:
                    - generic [ref=e175]: store credit
                    - generic [ref=e176]: credit
                    - generic [ref=e177]: ledger
                    - generic [ref=e178]: customer
                - generic [ref=e179]: ▼
              - button "Selling and redeeming gift cards gift card redeem balance sell ▼" [ref=e181]:
                - generic [ref=e182]:
                  - text: Selling and redeeming gift cards
                  - generic [ref=e183]:
                    - generic [ref=e184]: gift card
                    - generic [ref=e185]: redeem
                    - generic [ref=e186]: balance
                    - generic [ref=e187]: sell
                - generic [ref=e188]: ▼
              - 'button "Receipts: print, email, and QR receipt print email QR ▼" [ref=e190]':
                - generic [ref=e191]:
                  - text: "Receipts: print, email, and QR"
                  - generic [ref=e192]:
                    - generic [ref=e193]: receipt
                    - generic [ref=e194]: print
                    - generic [ref=e195]: email
                    - generic [ref=e196]: QR
                - generic [ref=e197]: ▼
              - button "Voiding a transaction void reverse cancel undo ▼" [ref=e199]:
                - generic [ref=e200]:
                  - text: Voiding a transaction
                  - generic [ref=e201]:
                    - generic [ref=e202]: void
                    - generic [ref=e203]: reverse
                    - generic [ref=e204]: cancel
                    - generic [ref=e205]: undo
                - generic [ref=e206]: ▼
              - button "Training mode training practice demo new staff ▼" [ref=e208]:
                - generic [ref=e209]:
                  - text: Training mode
                  - generic [ref=e210]:
                    - generic [ref=e211]: training
                    - generic [ref=e212]: practice
                    - generic [ref=e213]: demo
                    - generic [ref=e214]: new staff
                - generic [ref=e215]: ▼
          - generic [ref=e216]:
            - heading "Inventory" [level=2] [ref=e217]
            - generic [ref=e218]:
              - button "Adding inventory items add item inventory SKU product ▼" [ref=e220]:
                - generic [ref=e221]:
                  - text: Adding inventory items
                  - generic [ref=e222]:
                    - generic [ref=e223]: add item
                    - generic [ref=e224]: inventory
                    - generic [ref=e225]: SKU
                    - generic [ref=e226]: product
                - generic [ref=e227]: ▼
              - button "Searching Scryfall, Pokemon, and Yu-Gi-Oh catalogs scryfall pokemon yugioh catalog ▼" [ref=e229]:
                - generic [ref=e230]:
                  - text: Searching Scryfall, Pokemon, and Yu-Gi-Oh catalogs
                  - generic [ref=e231]:
                    - generic [ref=e232]: scryfall
                    - generic [ref=e233]: pokemon
                    - generic [ref=e234]: yugioh
                    - generic [ref=e235]: catalog
                - generic [ref=e236]: ▼
              - button "Bulk CSV import CSV import bulk TCGPlayer ▼" [ref=e238]:
                - generic [ref=e239]:
                  - text: Bulk CSV import
                  - generic [ref=e240]:
                    - generic [ref=e241]: CSV
                    - generic [ref=e242]: import
                    - generic [ref=e243]: bulk
                    - generic [ref=e244]: TCGPlayer
                - generic [ref=e245]: ▼
              - button "Running a stock count stock count physical count audit reconciliation ▼" [ref=e247]:
                - generic [ref=e248]:
                  - text: Running a stock count
                  - generic [ref=e249]:
                    - generic [ref=e250]: stock count
                    - generic [ref=e251]: physical count
                    - generic [ref=e252]: audit
                    - generic [ref=e253]: reconciliation
                - generic [ref=e254]: ▼
              - button "Low stock alerts low stock reorder alert threshold ▼" [ref=e256]:
                - generic [ref=e257]:
                  - text: Low stock alerts
                  - generic [ref=e258]:
                    - generic [ref=e259]: low stock
                    - generic [ref=e260]: reorder
                    - generic [ref=e261]: alert
                    - generic [ref=e262]: threshold
                - generic [ref=e263]: ▼
              - button "Printing barcode labels barcode label print sticker ▼" [ref=e265]:
                - generic [ref=e266]:
                  - text: Printing barcode labels
                  - generic [ref=e267]:
                    - generic [ref=e268]: barcode
                    - generic [ref=e269]: label
                    - generic [ref=e270]: print
                    - generic [ref=e271]: sticker
                - generic [ref=e272]: ▼
              - button "Category management category organize filter catalog ▼" [ref=e274]:
                - generic [ref=e275]:
                  - text: Category management
                  - generic [ref=e276]:
                    - generic [ref=e277]: category
                    - generic [ref=e278]: organize
                    - generic [ref=e279]: filter
                    - generic [ref=e280]: catalog
                - generic [ref=e281]: ▼
          - generic [ref=e282]:
            - heading "TCG Singles" [level=2] [ref=e283]
            - generic [ref=e284]:
              - button "Condition grading guide condition grading NM LP ▼" [ref=e286]:
                - generic [ref=e287]:
                  - text: Condition grading guide
                  - generic [ref=e288]:
                    - generic [ref=e289]: condition
                    - generic [ref=e290]: grading
                    - generic [ref=e291]: NM
                    - generic [ref=e292]: LP
                - generic [ref=e293]: ▼
              - button "Buylist pricing buylist pricing market trade-in ▼" [ref=e295]:
                - generic [ref=e296]:
                  - text: Buylist pricing
                  - generic [ref=e297]:
                    - generic [ref=e298]: buylist
                    - generic [ref=e299]: pricing
                    - generic [ref=e300]: market
                    - generic [ref=e301]: trade-in
                - generic [ref=e302]: ▼
              - button "Market pricing and Scryfall cache market price Scryfall cache price drift ▼" [ref=e304]:
                - generic [ref=e305]:
                  - text: Market pricing and Scryfall cache
                  - generic [ref=e306]:
                    - generic [ref=e307]: market price
                    - generic [ref=e308]: Scryfall
                    - generic [ref=e309]: cache
                    - generic [ref=e310]: price drift
                - generic [ref=e311]: ▼
              - button "One-click bulk repricing reprice bulk markup markdown ▼" [ref=e313]:
                - generic [ref=e314]:
                  - text: One-click bulk repricing
                  - generic [ref=e315]:
                    - generic [ref=e316]: reprice
                    - generic [ref=e317]: bulk
                    - generic [ref=e318]: markup
                    - generic [ref=e319]: markdown
                - generic [ref=e320]: ▼
              - button "Collection CSV import collection CSV import TCGPlayer ▼" [ref=e322]:
                - generic [ref=e323]:
                  - text: Collection CSV import
                  - generic [ref=e324]:
                    - generic [ref=e325]: collection
                    - generic [ref=e326]: CSV
                    - generic [ref=e327]: import
                    - generic [ref=e328]: TCGPlayer
                - generic [ref=e329]: ▼
              - button "Sealed EV calculator sealed EV expected value booster ▼" [ref=e331]:
                - generic [ref=e332]:
                  - text: Sealed EV calculator
                  - generic [ref=e333]:
                    - generic [ref=e334]: sealed
                    - generic [ref=e335]: EV
                    - generic [ref=e336]: expected value
                    - generic [ref=e337]: booster
                - generic [ref=e338]: ▼
          - generic [ref=e339]:
            - heading "Customers" [level=2] [ref=e340]
            - generic [ref=e341]:
              - button "Customer profiles customer profile history account ▼" [ref=e343]:
                - generic [ref=e344]:
                  - text: Customer profiles
                  - generic [ref=e345]:
                    - generic [ref=e346]: customer
                    - generic [ref=e347]: profile
                    - generic [ref=e348]: history
                    - generic [ref=e349]: account
                - generic [ref=e350]: ▼
              - 'button "Loyalty points: earning, redeeming, and claiming loyalty points rewards VIP ▼" [ref=e352]':
                - generic [ref=e353]:
                  - text: "Loyalty points: earning, redeeming, and claiming"
                  - generic [ref=e354]:
                    - generic [ref=e355]: loyalty
                    - generic [ref=e356]: points
                    - generic [ref=e357]: rewards
                    - generic [ref=e358]: VIP
                - generic [ref=e359]: ▼
              - button "Afterroar Passport Afterroar passport network cross-store ▼" [ref=e361]:
                - generic [ref=e362]:
                  - text: Afterroar Passport
                  - generic [ref=e363]:
                    - generic [ref=e364]: Afterroar
                    - generic [ref=e365]: passport
                    - generic [ref=e366]: network
                    - generic [ref=e367]: cross-store
                - generic [ref=e368]: ▼
              - button "Public buylist page buylist public customer-facing trade-in ▼" [ref=e370]:
                - generic [ref=e371]:
                  - text: Public buylist page
                  - generic [ref=e372]:
                    - generic [ref=e373]: buylist
                    - generic [ref=e374]: public
                    - generic [ref=e375]: customer-facing
                    - generic [ref=e376]: trade-in
                - generic [ref=e377]: ▼
          - generic [ref=e378]:
            - heading "Events & Tournaments" [level=2] [ref=e379]
            - generic [ref=e380]:
              - button "Creating events event create format entry fee ▼" [ref=e382]:
                - generic [ref=e383]:
                  - text: Creating events
                  - generic [ref=e384]:
                    - generic [ref=e385]: event
                    - generic [ref=e386]: create
                    - generic [ref=e387]: format
                    - generic [ref=e388]: entry fee
                - generic [ref=e389]: ▼
              - button "Event check-in flow check-in event attendance entry fee ▼" [ref=e391]:
                - generic [ref=e392]:
                  - text: Event check-in flow
                  - generic [ref=e393]:
                    - generic [ref=e394]: check-in
                    - generic [ref=e395]: event
                    - generic [ref=e396]: attendance
                    - generic [ref=e397]: entry fee
                - generic [ref=e398]: ▼
              - button "Swiss pairing tournaments Swiss pairing tournament FNM ▼" [ref=e400]:
                - generic [ref=e401]:
                  - text: Swiss pairing tournaments
                  - generic [ref=e402]:
                    - generic [ref=e403]: Swiss
                    - generic [ref=e404]: pairing
                    - generic [ref=e405]: tournament
                    - generic [ref=e406]: FNM
                - generic [ref=e407]: ▼
              - button "Single elimination brackets bracket elimination knockout playoff ▼" [ref=e409]:
                - generic [ref=e410]:
                  - text: Single elimination brackets
                  - generic [ref=e411]:
                    - generic [ref=e412]: bracket
                    - generic [ref=e413]: elimination
                    - generic [ref=e414]: knockout
                    - generic [ref=e415]: playoff
                - generic [ref=e416]: ▼
              - button "Prize payouts as store credit prize payout store credit ledger ▼" [ref=e418]:
                - generic [ref=e419]:
                  - text: Prize payouts as store credit
                  - generic [ref=e420]:
                    - generic [ref=e421]: prize
                    - generic [ref=e422]: payout
                    - generic [ref=e423]: store credit
                    - generic [ref=e424]: ledger
                - generic [ref=e425]: ▼
          - generic [ref=e426]:
            - heading "Cafe & Food" [level=2] [ref=e427]
            - generic [ref=e428]:
              - button "Opening cafe tabs tab cafe open table ▼" [ref=e430]:
                - generic [ref=e431]:
                  - text: Opening cafe tabs
                  - generic [ref=e432]:
                    - generic [ref=e433]: tab
                    - generic [ref=e434]: cafe
                    - generic [ref=e435]: open
                    - generic [ref=e436]: table
                - generic [ref=e437]: ▼
              - button "Menu builder and modifiers menu modifier food drink ▼" [ref=e439]:
                - generic [ref=e440]:
                  - text: Menu builder and modifiers
                  - generic [ref=e441]:
                    - generic [ref=e442]: menu
                    - generic [ref=e443]: modifier
                    - generic [ref=e444]: food
                    - generic [ref=e445]: drink
                - generic [ref=e446]: ▼
              - button "Table fees table fee hourly play fee game room ▼" [ref=e448]:
                - generic [ref=e449]:
                  - text: Table fees
                  - generic [ref=e450]:
                    - generic [ref=e451]: table fee
                    - generic [ref=e452]: hourly
                    - generic [ref=e453]: play fee
                    - generic [ref=e454]: game room
                - generic [ref=e455]: ▼
              - button "KDS and QR table ordering KDS kitchen QR table ordering ▼" [ref=e457]:
                - generic [ref=e458]:
                  - text: KDS and QR table ordering
                  - generic [ref=e459]:
                    - generic [ref=e460]: KDS
                    - generic [ref=e461]: kitchen
                    - generic [ref=e462]: QR
                    - generic [ref=e463]: table ordering
                - generic [ref=e464]: ▼
              - button "Tab transfer, split, and close transfer split close tab settle ▼" [ref=e466]:
                - generic [ref=e467]:
                  - text: Tab transfer, split, and close
                  - generic [ref=e468]:
                    - generic [ref=e469]: transfer
                    - generic [ref=e470]: split
                    - generic [ref=e471]: close tab
                    - generic [ref=e472]: settle
                - generic [ref=e473]: ▼
          - generic [ref=e474]:
            - heading "Trade-Ins & Returns" [level=2] [ref=e475]
            - generic [ref=e476]:
              - button "Processing a trade-in trade-in buy sell cards ▼" [ref=e478]:
                - generic [ref=e479]:
                  - text: Processing a trade-in
                  - generic [ref=e480]:
                    - generic [ref=e481]: trade-in
                    - generic [ref=e482]: buy
                    - generic [ref=e483]: sell
                    - generic [ref=e484]: cards
                - generic [ref=e485]: ▼
              - button "Cash vs credit payouts cash credit payout bonus ▼" [ref=e487]:
                - generic [ref=e488]:
                  - text: Cash vs credit payouts
                  - generic [ref=e489]:
                    - generic [ref=e490]: cash
                    - generic [ref=e491]: credit
                    - generic [ref=e492]: payout
                    - generic [ref=e493]: bonus
                - generic [ref=e494]: ▼
              - button "Processing returns return refund exchange reverse ▼" [ref=e496]:
                - generic [ref=e497]:
                  - text: Processing returns
                  - generic [ref=e498]:
                    - generic [ref=e499]: return
                    - generic [ref=e500]: refund
                    - generic [ref=e501]: exchange
                    - generic [ref=e502]: reverse
                - generic [ref=e503]: ▼
              - button "Consignment intake and management consignment commission intake consignor ▼" [ref=e505]:
                - generic [ref=e506]:
                  - text: Consignment intake and management
                  - generic [ref=e507]:
                    - generic [ref=e508]: consignment
                    - generic [ref=e509]: commission
                    - generic [ref=e510]: intake
                    - generic [ref=e511]: consignor
                - generic [ref=e512]: ▼
          - generic [ref=e513]:
            - heading "Shipping & Fulfillment" [level=2] [ref=e514]
            - generic [ref=e515]:
              - button "Fulfillment queue fulfillment queue pick pack ▼" [ref=e517]:
                - generic [ref=e518]:
                  - text: Fulfillment queue
                  - generic [ref=e519]:
                    - generic [ref=e520]: fulfillment
                    - generic [ref=e521]: queue
                    - generic [ref=e522]: pick
                    - generic [ref=e523]: pack
                - generic [ref=e524]: ▼
              - button "Pull sheets pull sheet pick list batch warehouse ▼" [ref=e526]:
                - generic [ref=e527]:
                  - text: Pull sheets
                  - generic [ref=e528]:
                    - generic [ref=e529]: pull sheet
                    - generic [ref=e530]: pick list
                    - generic [ref=e531]: batch
                    - generic [ref=e532]: warehouse
                - generic [ref=e533]: ▼
              - button "Shipping labels and rate shopping shipping label ShipStation rate shop ▼" [ref=e535]:
                - generic [ref=e536]:
                  - text: Shipping labels and rate shopping
                  - generic [ref=e537]:
                    - generic [ref=e538]: shipping
                    - generic [ref=e539]: label
                    - generic [ref=e540]: ShipStation
                    - generic [ref=e541]: rate shop
                - generic [ref=e542]: ▼
              - button "Order ingestion API API order ingestion integration ▼" [ref=e544]:
                - generic [ref=e545]:
                  - text: Order ingestion API
                  - generic [ref=e546]:
                    - generic [ref=e547]: API
                    - generic [ref=e548]: order
                    - generic [ref=e549]: ingestion
                    - generic [ref=e550]: integration
                - generic [ref=e551]: ▼
          - generic [ref=e552]:
            - heading "Marketplace & E-Commerce" [level=2] [ref=e553]
            - generic [ref=e554]:
              - button "eBay integration eBay marketplace listing OAuth ▼" [ref=e556]:
                - generic [ref=e557]:
                  - text: eBay integration
                  - generic [ref=e558]:
                    - generic [ref=e559]: eBay
                    - generic [ref=e560]: marketplace
                    - generic [ref=e561]: listing
                    - generic [ref=e562]: OAuth
                - generic [ref=e563]: ▼
              - button "Bulk eBay listing eBay bulk listing TCG ▼" [ref=e565]:
                - generic [ref=e566]:
                  - text: Bulk eBay listing
                  - generic [ref=e567]:
                    - generic [ref=e568]: eBay
                    - generic [ref=e569]: bulk
                    - generic [ref=e570]: listing
                    - generic [ref=e571]: TCG
                - generic [ref=e572]: ▼
              - button "API keys and generic order API API key integration webhook ▼" [ref=e574]:
                - generic [ref=e575]:
                  - text: API keys and generic order API
                  - generic [ref=e576]:
                    - generic [ref=e577]: API
                    - generic [ref=e578]: key
                    - generic [ref=e579]: integration
                    - generic [ref=e580]: webhook
                - generic [ref=e581]: ▼
          - generic [ref=e582]:
            - heading "Reports & Intelligence" [level=2] [ref=e583]
            - generic [ref=e584]:
              - button "Cash flow reports cash flow revenue expenses liquidity ▼" [ref=e586]:
                - generic [ref=e587]:
                  - text: Cash flow reports
                  - generic [ref=e588]:
                    - generic [ref=e589]: cash flow
                    - generic [ref=e590]: revenue
                    - generic [ref=e591]: expenses
                    - generic [ref=e592]: liquidity
                - generic [ref=e593]: ▼
              - button "COGS and margins COGS margin profit cost ▼" [ref=e595]:
                - generic [ref=e596]:
                  - text: COGS and margins
                  - generic [ref=e597]:
                    - generic [ref=e598]: COGS
                    - generic [ref=e599]: margin
                    - generic [ref=e600]: profit
                    - generic [ref=e601]: cost
                - generic [ref=e602]: ▼
              - button "Dead stock and bench warmers dead stock bench warmers slow movers clearance ▼" [ref=e604]:
                - generic [ref=e605]:
                  - text: Dead stock and bench warmers
                  - generic [ref=e606]:
                    - generic [ref=e607]: dead stock
                    - generic [ref=e608]: bench warmers
                    - generic [ref=e609]: slow movers
                    - generic [ref=e610]: clearance
                - generic [ref=e611]: ▼
              - button "Event ROI event ROI revenue attribution ▼" [ref=e613]:
                - generic [ref=e614]:
                  - text: Event ROI
                  - generic [ref=e615]:
                    - generic [ref=e616]: event
                    - generic [ref=e617]: ROI
                    - generic [ref=e618]: revenue
                    - generic [ref=e619]: attribution
                - generic [ref=e620]: ▼
              - button "Store Advisor advisor intelligence insights recommendations ▼" [ref=e622]:
                - generic [ref=e623]:
                  - text: Store Advisor
                  - generic [ref=e624]:
                    - generic [ref=e625]: advisor
                    - generic [ref=e626]: intelligence
                    - generic [ref=e627]: insights
                    - generic [ref=e628]: recommendations
                - generic [ref=e629]: ▼
              - button "Intelligence preferences preferences settings thresholds intelligence ▼" [ref=e631]:
                - generic [ref=e632]:
                  - text: Intelligence preferences
                  - generic [ref=e633]:
                    - generic [ref=e634]: preferences
                    - generic [ref=e635]: settings
                    - generic [ref=e636]: thresholds
                    - generic [ref=e637]: intelligence
                - generic [ref=e638]: ▼
          - generic [ref=e639]:
            - heading "Staff & Admin" [level=2] [ref=e640]
            - generic [ref=e641]:
              - button "Staff management staff team add role ▼" [ref=e643]:
                - generic [ref=e644]:
                  - text: Staff management
                  - generic [ref=e645]:
                    - generic [ref=e646]: staff
                    - generic [ref=e647]: team
                    - generic [ref=e648]: add
                    - generic [ref=e649]: role
                - generic [ref=e650]: ▼
              - button "Roles and permissions (30+) permissions roles access control granular ▼" [ref=e652]:
                - generic [ref=e653]:
                  - text: Roles and permissions (30+)
                  - generic [ref=e654]:
                    - generic [ref=e655]: permissions
                    - generic [ref=e656]: roles
                    - generic [ref=e657]: access control
                    - generic [ref=e658]: granular
                - generic [ref=e659]: ▼
              - 'button "Timeclock: PIN, geofence, adjusted clock-out timeclock PIN clock in clock out ▼" [ref=e661]':
                - generic [ref=e662]:
                  - text: "Timeclock: PIN, geofence, adjusted clock-out"
                  - generic [ref=e663]:
                    - generic [ref=e664]: timeclock
                    - generic [ref=e665]: PIN
                    - generic [ref=e666]: clock in
                    - generic [ref=e667]: clock out
                - generic [ref=e668]: ▼
              - button "Mobile register mobile register access code PIN ▼" [ref=e670]:
                - generic [ref=e671]:
                  - text: Mobile register
                  - generic [ref=e672]:
                    - generic [ref=e673]: mobile
                    - generic [ref=e674]: register
                    - generic [ref=e675]: access code
                    - generic [ref=e676]: PIN
                - generic [ref=e677]: ▼
              - button "Store settings and billing settings billing plan subscription ▼" [ref=e679]:
                - generic [ref=e680]:
                  - text: Store settings and billing
                  - generic [ref=e681]:
                    - generic [ref=e682]: settings
                    - generic [ref=e683]: billing
                    - generic [ref=e684]: plan
                    - generic [ref=e685]: subscription
                - generic [ref=e686]: ▼
          - generic [ref=e687]:
            - heading "Troubleshooting" [level=2] [ref=e688]
            - generic [ref=e689]:
              - button "Scanner not working scanner barcode not working USB ▼" [ref=e691]:
                - generic [ref=e692]:
                  - text: Scanner not working
                  - generic [ref=e693]:
                    - generic [ref=e694]: scanner
                    - generic [ref=e695]: barcode
                    - generic [ref=e696]: not working
                    - generic [ref=e697]: USB
                - generic [ref=e698]: ▼
              - button "Payment failed payment failed error Stripe ▼" [ref=e700]:
                - generic [ref=e701]:
                  - text: Payment failed
                  - generic [ref=e702]:
                    - generic [ref=e703]: payment
                    - generic [ref=e704]: failed
                    - generic [ref=e705]: error
                    - generic [ref=e706]: Stripe
                - generic [ref=e707]: ▼
              - button "Terminal reader setup (S710) terminal S710 reader Stripe ▼" [ref=e709]:
                - generic [ref=e710]:
                  - text: Terminal reader setup (S710)
                  - generic [ref=e711]:
                    - generic [ref=e712]: terminal
                    - generic [ref=e713]: S710
                    - generic [ref=e714]: reader
                    - generic [ref=e715]: Stripe
                - generic [ref=e716]: ▼
              - button "Keyboard shortcut conflicts keyboard shortcut conflict input ▼" [ref=e718]:
                - generic [ref=e719]:
                  - text: Keyboard shortcut conflicts
                  - generic [ref=e720]:
                    - generic [ref=e721]: keyboard
                    - generic [ref=e722]: shortcut
                    - generic [ref=e723]: conflict
                    - generic [ref=e724]: input
                - generic [ref=e725]: ▼
              - button "Sync and offline issues sync offline network connection ▼" [ref=e727]:
                - generic [ref=e728]:
                  - text: Sync and offline issues
                  - generic [ref=e729]:
                    - generic [ref=e730]: sync
                    - generic [ref=e731]: offline
                    - generic [ref=e732]: network
                    - generic [ref=e733]: connection
                - generic [ref=e734]: ▼
    - navigation [ref=e735]:
      - generic [ref=e736]:
        - link "◈ Register" [ref=e737] [cursor=pointer]:
          - /url: /dashboard/register
          - generic [ref=e738]: ◈
          - generic [ref=e739]: Register
        - link "▦ Inventory" [ref=e740] [cursor=pointer]:
          - /url: /dashboard/inventory
          - generic [ref=e741]: ▦
          - generic [ref=e742]: Inventory
        - link "♟ Customers" [ref=e743] [cursor=pointer]:
          - /url: /dashboard/customers
          - generic [ref=e744]: ♟
          - generic [ref=e745]: Customers
        - button "··· More" [ref=e746]:
          - generic [ref=e747]: ···
          - generic [ref=e748]: More
  - alert [ref=e749]
```

# Test source

```ts
  1   | /**
  2   |  * Mobile Overflow Test
  3   |  *
  4   |  * Checks every authenticated page at mobile viewport (390x844) for:
  5   |  * 1. No horizontal overflow (nothing wider than viewport)
  6   |  * 2. All buttons/links are within viewport bounds
  7   |  * 3. No elements clipped at right edge
  8   |  *
  9   |  * Run: npx playwright test tests/mobile-overflow.spec.ts --project=mobile-overflow
  10  |  */
  11  | import { test, expect } from "@playwright/test";
  12  | 
  13  | const PAGES = [
  14  |   "/dashboard",
  15  |   "/dashboard/register",
  16  |   "/dashboard/inventory",
  17  |   "/dashboard/singles",
  18  |   "/dashboard/customers",
  19  |   "/dashboard/events",
  20  |   "/dashboard/cafe",
  21  |   "/dashboard/trade-ins",
  22  |   "/dashboard/returns",
  23  |   "/dashboard/cash-flow",
  24  |   "/dashboard/staff",
  25  |   "/dashboard/settings/store",
  26  |   "/dashboard/settings/payments",
  27  |   "/dashboard/help",
  28  | ];
  29  | 
  30  | test.describe("authenticated: mobile overflow checks", () => {
  31  |   for (const pagePath of PAGES) {
  32  |     test(`mobile overflow - ${pagePath}`, async ({ page }) => {
  33  |       await page.goto(pagePath, { waitUntil: "domcontentloaded", timeout: 30_000 });
  34  |       await page.waitForTimeout(2000);
  35  | 
  36  |       const viewportWidth = 390;
  37  | 
  38  |       // Check for horizontal overflow
  39  |       const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
  40  |       const hasHorizontalOverflow = bodyScrollWidth > viewportWidth + 5; // 5px tolerance
  41  | 
  42  |       if (hasHorizontalOverflow) {
  43  |         // Find the offending elements
  44  |         const overflowingElements = await page.evaluate((vw) => {
  45  |           const elements: string[] = [];
  46  |           document.querySelectorAll("*").forEach((el) => {
  47  |             const rect = el.getBoundingClientRect();
  48  |             if (rect.right > vw + 5 && rect.width > 0 && rect.height > 0) {
  49  |               const tag = el.tagName.toLowerCase();
  50  |               const cls = el.className?.toString().slice(0, 60) || "";
  51  |               const text = el.textContent?.slice(0, 30) || "";
  52  |               elements.push(`<${tag} class="${cls}"> "${text}" (right: ${Math.round(rect.right)}px)`);
  53  |             }
  54  |           });
  55  |           return elements.slice(0, 5); // First 5 offenders
  56  |         }, viewportWidth);
  57  | 
  58  |         console.log(`[${pagePath}] Horizontal overflow detected (scrollWidth: ${bodyScrollWidth}px):`);
  59  |         overflowingElements.forEach((el) => console.log(`  - ${el}`));
  60  |       }
  61  | 
  62  |       // Don't hard-fail on overflow for now — just report. Uncomment to enforce:
  63  |       // expect(hasHorizontalOverflow, `Horizontal overflow on ${pagePath}`).toBeFalsy();
  64  | 
  65  |       // Check that all interactive elements (buttons, links) are within viewport
  66  |       const clippedButtons = await page.evaluate((vw) => {
  67  |         const clipped: string[] = [];
  68  |         document.querySelectorAll("button, a, input, select").forEach((el) => {
  69  |           const rect = el.getBoundingClientRect();
  70  |           // Skip invisible/hidden elements
  71  |           if (rect.width === 0 || rect.height === 0) return;
  72  |           // Skip elements far off-screen (in scroll containers)
  73  |           if (rect.top > 2000 || rect.top < -100) return;
  74  | 
  75  |           const rightMargin = vw - rect.right;
  76  |           const leftMargin = rect.left;
  77  | 
  78  |           if (rightMargin < 0) {
  79  |             const tag = el.tagName.toLowerCase();
  80  |             const text = (el.textContent || (el as HTMLInputElement).placeholder || "").slice(0, 30);
  81  |             clipped.push(`<${tag}> "${text}" overflows right by ${Math.abs(Math.round(rightMargin))}px`);
  82  |           }
  83  |           if (leftMargin < 0) {
  84  |             const tag = el.tagName.toLowerCase();
  85  |             const text = (el.textContent || "").slice(0, 30);
  86  |             clipped.push(`<${tag}> "${text}" overflows left by ${Math.abs(Math.round(leftMargin))}px`);
  87  |           }
  88  |         });
  89  |         return clipped;
  90  |       }, viewportWidth);
  91  | 
  92  |       if (clippedButtons.length > 0) {
  93  |         console.log(`[${pagePath}] Clipped interactive elements:`);
  94  |         clippedButtons.forEach((el) => console.log(`  - ${el}`));
  95  |       }
  96  | 
  97  |       // This SHOULD pass — clipped buttons are a real usability problem
  98  |       expect(
  99  |         clippedButtons.length,
  100 |         `${pagePath} has ${clippedButtons.length} clipped buttons/links:\n${clippedButtons.join("\n")}`
> 101 |       ).toBe(0);
      |         ^ Error: /dashboard/help has 12 clipped buttons/links:
  102 |     });
  103 |   }
  104 | });
  105 | 
```