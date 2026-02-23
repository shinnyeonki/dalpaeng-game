echo "Are you sure you want to deploy? (y/n)"
read answer
if [ "$answer" != "y" ]; then
    echo "Deployment cancelled."
    exit 1
fi

echo "Removing old file"
sudo rm -rf /var/www/dalpaeng.mmv.kr/*.html
sudo rm -rf /var/www/dalpaeng.mmv.kr/*.js
sudo rm -rf /var/www/dalpaeng.mmv.kr/*.css


echo "Copying new dist to remote location..."
sudo cp -r *.html /var/www/dalpaeng.mmv.kr/
sudo cp -r *.js /var/www/dalpaeng.mmv.kr/
sudo cp -r *.css /var/www/dalpaeng.mmv.kr/


echo "[5/5] Deployment complete."