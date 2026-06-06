import requests
import json

url = "http://localhost:8000/auth/login"
payload = {"email": "admin@billbite.com", "password": "admin123"}
headers = {"Content-Type": "application/json"}

response = requests.post(url, json=payload, headers=headers)
print("Status:", response.status_code)
print("Response:", response.text)