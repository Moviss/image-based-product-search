#!/bin/bash
mongoimport --host localhost --db product_search --collection products --type json --file /docker-entrypoint-initdb.d/data/catalog.products.json --jsonArray
