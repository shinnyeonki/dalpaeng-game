echo "Are you sure you want to deploy? (y/n)"
read answer
if [ "$answer" != "y" ]; then
    echo "Deployment cancelled."
    exit 1
fi

echo "Removing old file"
sudo rm -rf /var/www/dalpaeng.mmv.kr/index.html
sudo rm -rf /var/www/dalpaeng.mmv.kr/script.js
sudo rm -rf /var/www/dalpaeng.mmv.kr/style.css

echo "Copying new dist to remote location..."
sudo cp -r index.html /var/www/dalpaeng.mmv.kr/
sudo cp -r script.js /var/www/dalpaeng.mmv.kr/
sudo cp -r style.css /var/www/dalpaeng.mmv.kr/

echo "[5/5] Deployment complete."