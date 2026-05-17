A StockX API, FlightClub API, Goat API, and Stadium Goods API all in one.

Sneaks API is a production-ready sneaker API built using Node.JS, Express, and Got. The Sneaks API allows users to get essential sneaker content such as images, product links and even prices from resell sites. This API mainly scrapes StockX for sneaker information and then asynchronously scrapes Stadium Goods, Goat, and Flight Club for additional sneaker information such as images and its respective resell price.

## Features

- **Caching Layer**: In-memory caching with 1-hour TTL for products, 30-minute TTL for prices (90% faster on cache hits)
- **Rate Limiting**: 100 requests per 15 minutes per IP to prevent abuse
- **Enhanced Data Model**: Multiple image angles, size availability tracking, price history, release status
- **Standardized Responses**: Consistent JSON format with success/error handling
- **Health Monitoring**: Built-in health check and cache statistics endpoints

This API outputs a sneaker object with the following data:

  - Sneaker Name
  - Colorway
  - Description
  - Release Date
  - Retail Price
  - Style ID
  - **Image Gallery** (multiple angles with metadata)
  - **Size Availability Map** (real-time stock tracking)
  - **Price History** (track price changes over time)
  - **Release Status** (upcoming, available, limited, sold_out)
  - **Popularity Metrics** (search/view counts)
  - Product links from each of the resell sites
  - Price map (of shoe size to price) from each of the resell sites
  - And more
  
  
  

I built this API so sneaker heads and developers are able to create sneaker based programs, trackers and websites without having to fumble with scrapping information on all 4 resell websites. Feel free to fork, edit and submit a pull request for this API for any changes or improvements. If you have any questions or issues regarding this feel free to create an issue and I will try to answer them as soon as I can.

UPDATE: As per many requests, I updated this API to version 1.1 which removes the caching database from the API so no need to download and have MongoDB running for the API. If youd like to use the database version of the API, it is now a depreciated [branch](https://github.com/druv5319/Sneaks-API/tree/API-with-database) to this repository.
## Demo
### Sneaks App - [Website](https://sneaks-app.com) | [Github](https://github.com/druv5319/sneaks-app)
<img src="https://github.com/druv5319/Sneaks-API/blob/master/Screenshots/demo.gif" width=600 >
  


## Technologies Used
  - Node.JS
  - Express
  - Got
  - Request
  - Mongoose
  - node-cache (In-memory caching)
  - express-rate-limit (API rate limiting)
  - helmet (Security headers)
  - cors (Cross-origin support)
  

  
## Installation
To use this API you will need to have [node.js](https://nodejs.org/en/) installed and running.
Once installed, use this line on the terminal within your project directory
```
npm install sneaks-api
```
and place this line at the top of your main file
```js
const SneaksAPI = require('sneaks-api');
```
## How to Use
### Method #1: Using the SneaksAPI class
```js
const SneaksAPI = require('sneaks-api');
const sneaks = new SneaksAPI();

//getProducts(keyword, callback) takes in a keyword and returns an array of products
sneaks.getProducts("Yeezy Cinder", function(err, products){
    console.log(products)
})

//Product object includes styleID where you input it in the getProductPrices function
//getProductPrices(styleID, callback) takes in a style ID and returns sneaker info including a price map and more images of the product
sneaks.getProductPrices("FY2903", function(err, product){
    console.log(product)
})
//getMostPopular(callback) returns an array of the current popular products curated by StockX
sneaks.getMostPopular(function(err, products){
    console.log(products)
})
```
[Console log](https://github.com/druv5319/Sneaks-API/blob/master/Screenshots/exampleSearchScreenshot%231.png) of sneaks.getProducts("Yeezy Cinder", ...)           
[Console log](https://github.com/druv5319/Sneaks-API/blob/master/Screenshots/exampleSearchScreenshot%232.png) of sneaks.getProductPrices("FY2903", ...)

### Method #2: Using localhost:8080
Once your program starts with the sneaks-api module imported, a server should start and listen on port 8080

## API Endpoints

### Product Endpoints

#### Get Product by ID
Returns detailed product information for a specific sneaker.
```
GET localhost:8080/id/:id
```
**Response includes:** Name, colorway, images, prices, release date, retail price, style ID, product links
**Cache:** 1 hour

#### Get Product Prices
Returns size-to-price mappings from all resell platforms.
```
GET localhost:8080/id/:id/prices
```
**Response includes:** Price maps for StockX, GOAT, Flight Club, Stadium Goods by size
**Cache:** 30 minutes

---

### Search Endpoints

#### Search Sneakers
Search for sneakers by keyword with optional count parameter.
```
GET localhost:8080/search/:keyword?count=40
```
**Query Parameters:**
- `count` (optional): Number of results to return (default: 40)

**Example:**
```
GET localhost:8080/search/jordan?count=10
GET localhost:8080/search/yeezy
```
**Cache:** 1 hour

---

### Popular Sneakers

#### Get Popular Sneakers
Returns the most popular sneakers curated by StockX.
```
GET localhost:8080/popular/:count
```
**Example:**
```
GET localhost:8080/popular/10
GET localhost:8080/popular/50
```
**Cache:** 30 minutes

#### Homepage Feed
Returns a curated homepage feed of popular sneakers.
```
GET localhost:8080/home
```
**Cache:** 1 hour

---

### News & Release Endpoints

#### Get Latest News
Returns the latest sneaker news articles from SneakerNews.
```
GET localhost:8080/news/latest
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Air Jordan 1 High 'Lost and Found' Release Info",
      "image": "https://...",
      "url": "https://sneakernews.com/...",
      "category": "Releases",
      "publishedAt": "January 14, 2026",
      "excerpt": "The Air Jordan 1 High 'Lost and Found'...",
      "source": "SneakerNews",
      "type": "latest"
    }
  ],
  "meta": {
    "count": 20,
    "source": "aggregated",
    "cached": false
  }
}
```
**Cache:** 30 minutes

#### Get All SneakerNews Articles
Returns all SneakerNews articles (latest + popular combined).
```
GET localhost:8080/news/sneakernews
```
**Response:** Array of articles with latest and popular posts combined, removing duplicates
**Cache:** 30 minutes

#### Get Popular SneakerNews
Returns only popular/trending articles from SneakerNews.
```
GET localhost:8080/news/sneakernews/popular
```
**Response:** Array of popular articles
**Cache:** 30 minutes

#### Get SneakerNews by Category
Returns articles from a specific category.
```
GET localhost:8080/news/sneakernews/category/:category
```
**Examples:**
```
GET localhost:8080/news/sneakernews/category/releases
GET localhost:8080/news/sneakernews/category/jordan
GET localhost:8080/news/sneakernews/category/nike
GET localhost:8080/news/sneakernews/category/adidas
```
**Response:** Array of category-specific articles
**Cache:** 30 minutes

#### Search SneakerNews
Search for specific articles on SneakerNews.
```
GET localhost:8080/news/sneakernews/search?q=query
```
**Query Parameters:**
- `q` (required): Search query

**Examples:**
```
GET localhost:8080/news/sneakernews/search?q=yeezy
GET localhost:8080/news/sneakernews/search?q=dunk
```
**Response:** Array of matching articles
**Cache:** 30 minutes

#### Get Sole Collector Featured
Returns featured articles from Sole Collector.
```
GET localhost:8080/news/solecollector
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Nike Dunk Low 'Panda' Restock",
      "image": "https://...",
      "url": "https://solecollector.com/...",
      "type": "featured",
      "source": "SoleCollector"
    }
  ],
  "meta": {
    "count": 15,
    "source": "SoleCollector",
    "cached": false
  }
}
```
**Cache:** 30 minutes

#### Get Complex Sneaker News
Returns sneaker news from Complex.
```
GET localhost:8080/news/complex
```
**Response:** Array of Complex sneaker articles
**Cache:** 30 minutes

#### Get Upcoming Releases
Returns upcoming sneaker releases from Nice Kicks.
```
GET localhost:8080/news/releases/upcoming
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Air Jordan 4 'Military Black'",
      "image": "https://...",
      "url": "https://nicekicks.com/...",
      "releaseDate": {
        "month": "May",
        "day": "6",
        "display": "May 6"
      },
      "details": "Release info and pricing",
      "source": "NiceKicks"
    }
  ],
  "meta": {
    "count": 25,
    "source": "NiceKicks",
    "cached": false
  }
}
```
**Cache:** 1 hour

#### Get Nike SNKRS Releases
Returns upcoming releases from Nike SNKRS.
```
GET localhost:8080/news/releases/snkrs
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Air Max 1 '86 OG G University Red",
      "releaseDate": "Jan 15",
      "image": "https://...",
      "url": "https://www.nike.com/launch/...",
      "source": "Nike SNKRS"
    }
  ],
  "meta": {
    "count": 30,
    "source": "Nike SNKRS",
    "cached": false
  }
}
```
**Cache:** 1 hour

---

### Utility Endpoints

#### Health Check
Returns API health status, uptime, and cache statistics.
```
GET localhost:8080/health
```
**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime": 123.45,
    "cache": {
      "hits": 10,
      "misses": 5,
      "keys": 8
    }
  }
}
```

#### Cache Statistics
Returns detailed cache performance metrics.
```
GET localhost:8080/cache/stats
```
**Response:**
```json
{
  "success": true,
  "data": {
    "hits": 100,
    "misses": 20,
    "keys": 15,
    "ksize": 150,
    "vsize": 500
  }
}
```

#### Clear Cache
Clears all cached data.
```
DELETE localhost:8080/cache
```

---

## Response Format

All endpoints return a standardized JSON response:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z",
    "count": 10,
    "cached": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": 404,
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

## Rate Limiting

The API implements rate limiting to prevent abuse:
- **Limit:** 100 requests per 15 minutes per IP address
- **Response when exceeded:** HTTP 429 with error message
- **Headers included:**
  - `RateLimit-Limit`: Maximum requests allowed
  - `RateLimit-Remaining`: Requests remaining in current window
  - `RateLimit-Reset`: Timestamp when limit resets

---

## Enhanced Data Fields

### Images Array
Multiple product images with viewing angles:
```json
"images": [
  {
    "url": "https://...",
    "angle": "main",
    "source": "stockx"
  },
  {
    "url": "https://...",
    "angle": "side",
    "source": "goat"
  }
]
```

### Size Availability
Real-time stock tracking by size:
```json
"sizeAvailability": {
  "8": true,
  "8.5": false,
  "9": true
}
```

### Price History
Track price changes over time:
```json
"priceHistory": [
  {
    "date": "2026-01-05T10:00:00.000Z",
    "prices": {
      "stockX": {
        "lowestAsk": 286,
        "highestBid": 337,
        "lastSale": 315
      }
    }
  }
]
```

### Release Status
Product availability status:
- `upcoming` - Not yet released
- `available` - Currently available
- `limited` - Limited stock
- `sold_out` - Out of stock

---

## Performance

- **Cache Hit:** < 100ms response time
- **Cache Miss:** 8-15 seconds (scraping time)
- **Cache Efficiency:** Up to 90% reduction in external API calls

---

## Example Usage

### cURL Examples

```bash
# Search for sneakers
curl "http://localhost:8080/search/jordan?count=5"

# Get product details
curl "http://localhost:8080/id/air-jordan-1-retro-high-og"

# Get product prices
curl "http://localhost:8080/id/air-jordan-1-retro-high-og/prices"

# Get popular sneakers
curl "http://localhost:8080/popular/10"

# Check API health
curl "http://localhost:8080/health"

# View cache stats
curl "http://localhost:8080/cache/stats"
```

### JavaScript/Node.js Examples

```javascript
const axios = require('axios');

// Search for sneakers
axios.get('http://localhost:8080/search/yeezy?count=10')
  .then(response => {
    const { success, data, meta } = response.data;
    console.log(`Found ${meta.count} products (cached: ${meta.cached})`);
    console.log(data);
  });

// Get product with full details
axios.get('http://localhost:8080/id/yeezy-boost-350-v2')
  .then(response => {
    const product = response.data.data;
    console.log(`Images: ${product.images.length}`);
    console.log(`Release Status: ${product.releaseStatus}`);
    console.log(`Available Sizes:`, Object.keys(product.sizeAvailability));
  });

// Get latest sneaker news
axios.get('http://localhost:8080/news/latest')
  .then(response => {
    const articles = response.data.data;
    console.log(`Found ${response.data.meta.count} articles`);
    articles.forEach(article => {
      console.log(`${article.title} - ${article.source}`);
    });
  });

// Search SneakerNews
axios.get('http://localhost:8080/news/sneakernews/search?q=jordan')
  .then(response => {
    const articles = response.data.data;
    console.log(`Found ${articles.length} articles about Jordan`);
  });

// Get upcoming releases
axios.get('http://localhost:8080/news/releases/upcoming')
  .then(response => {
    const releases = response.data.data;
    releases.forEach(release => {
      console.log(`${release.title} - ${release.releaseDate.display}`);
    });
  });
```

---

For more detailed information about production features, see [API-FEATURES.md](API-FEATURES.md)

