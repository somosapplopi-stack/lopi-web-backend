#!/usr/bin/env python3
"""
Comprehensive backend API test suite for LOPI backend.
Tests all endpoints against the public URL: https://lopi-web.preview.emergentagent.com/api
"""
import io
import json
import random
import string
import sys
from datetime import datetime, timedelta

import requests

BASE_URL = "https://lopi-web.preview.emergentagent.com/api"

# Test credentials from seeded data
DEMO_EMAIL = "carolinav@lopi.demo"
DEMO_USERNAME = "carolinav"
DEMO_PASSWORD = "Demo1234!"

# Color codes for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

test_results = []


def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = f"{GREEN}✅ PASS{RESET}" if passed else f"{RED}❌ FAIL{RESET}"
    print(f"{status} | {name}")
    if details:
        print(f"       {details}")
    test_results.append({"name": name, "passed": passed, "details": details})


def random_string(length=8):
    """Generate random string"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


def test_auth_login_email():
    """Test login with email"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "identifier": DEMO_EMAIL,
            "password": DEMO_PASSWORD
        }, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if "access_token" in data and "user" in data:
                log_test("Auth: Login with EMAIL", True, f"Status: {resp.status_code}, Token received")
                return data["access_token"]
            else:
                log_test("Auth: Login with EMAIL", False, f"Status: {resp.status_code}, Missing token or user in response")
                return None
        else:
            log_test("Auth: Login with EMAIL", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return None
    except Exception as e:
        log_test("Auth: Login with EMAIL", False, f"Exception: {str(e)}")
        return None


def test_auth_login_username():
    """Test login with username"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "identifier": DEMO_USERNAME,
            "password": DEMO_PASSWORD
        }, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if "access_token" in data and "user" in data:
                log_test("Auth: Login with USERNAME", True, f"Status: {resp.status_code}, Token received")
                return data["access_token"]
            else:
                log_test("Auth: Login with USERNAME", False, f"Status: {resp.status_code}, Missing token or user")
                return None
        else:
            log_test("Auth: Login with USERNAME", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return None
    except Exception as e:
        log_test("Auth: Login with USERNAME", False, f"Exception: {str(e)}")
        return None


def test_auth_login_wrong_password():
    """Test login with wrong password"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "identifier": DEMO_EMAIL,
            "password": "WrongPassword123!"
        }, timeout=10)
        
        if resp.status_code == 401:
            log_test("Auth: Login with WRONG password", True, f"Status: {resp.status_code} (correctly rejected)")
        else:
            log_test("Auth: Login with WRONG password", False, f"Expected 401, got {resp.status_code}")
    except Exception as e:
        log_test("Auth: Login with WRONG password", False, f"Exception: {str(e)}")


def test_auth_me(token):
    """Test GET /auth/me"""
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if "id" in data and "email" in data:
                log_test("Auth: GET /auth/me", True, f"Status: {resp.status_code}, User: {data.get('username')}")
                return data
            else:
                log_test("Auth: GET /auth/me", False, f"Status: {resp.status_code}, Missing user fields")
                return None
        else:
            log_test("Auth: GET /auth/me", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return None
    except Exception as e:
        log_test("Auth: GET /auth/me", False, f"Exception: {str(e)}")
        return None


def test_auth_register():
    """Test POST /auth/register with new unique user"""
    try:
        unique_id = random_string(8)
        new_user = {
            "name": f"Test User {unique_id}",
            "username": f"testuser{unique_id}",
            "email": f"testuser{unique_id}@test.com",
            "password": "TestPass123!",
            "city": "Bucaramanga"
        }
        
        resp = requests.post(f"{BASE_URL}/auth/register", json=new_user, timeout=10)
        
        if resp.status_code == 201:
            data = resp.json()
            if "access_token" in data and "user" in data:
                log_test("Auth: Register NEW user", True, f"Status: {resp.status_code}, User: {new_user['username']}")
                return data["access_token"], new_user
            else:
                log_test("Auth: Register NEW user", False, f"Status: {resp.status_code}, Missing token or user")
                return None, None
        else:
            log_test("Auth: Register NEW user", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return None, None
    except Exception as e:
        log_test("Auth: Register NEW user", False, f"Exception: {str(e)}")
        return None, None


def test_auth_interests(token):
    """Test POST /auth/interests"""
    try:
        interests = ["deportes", "gastronomia", "cultura", "aire-libre", "fiestas"]
        resp = requests.post(f"{BASE_URL}/auth/interests", 
            json={"interests": interests},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if "interests" in data and len(data["interests"]) == 5:
                log_test("Auth: POST /auth/interests", True, f"Status: {resp.status_code}, Interests set: {len(data['interests'])}")
            else:
                log_test("Auth: POST /auth/interests", False, f"Status: {resp.status_code}, Interests not properly set")
        else:
            log_test("Auth: POST /auth/interests", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Auth: POST /auth/interests", False, f"Exception: {str(e)}")


def test_auth_profile_update(token):
    """Test PATCH /auth/profile"""
    try:
        updates = {
            "name": "Updated Test Name",
            "city": "Medellín",
            "bio": "This is my updated bio for testing"
        }
        resp = requests.patch(f"{BASE_URL}/auth/profile",
            json=updates,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("name") == updates["name"] and data.get("city") == updates["city"]:
                log_test("Auth: PATCH /auth/profile", True, f"Status: {resp.status_code}, Profile updated")
            else:
                log_test("Auth: PATCH /auth/profile", False, f"Status: {resp.status_code}, Profile not updated correctly")
        else:
            log_test("Auth: PATCH /auth/profile", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Auth: PATCH /auth/profile", False, f"Exception: {str(e)}")


def test_parches_feed(token):
    """Test GET /parches/feed"""
    try:
        resp = requests.get(f"{BASE_URL}/parches/feed",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            parche_count = len(data)
            if parche_count == 20:
                log_test("Parches: GET /parches/feed", True, f"Status: {resp.status_code}, Parches: {parche_count} (expected 20)")
                return data
            else:
                log_test("Parches: GET /parches/feed", False, f"Status: {resp.status_code}, Parches: {parche_count} (expected 20)")
                return data
        else:
            log_test("Parches: GET /parches/feed", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return []
    except Exception as e:
        log_test("Parches: GET /parches/feed", False, f"Exception: {str(e)}")
        return []


def test_parches_detail(token, parche_id):
    """Test GET /parches/{id}"""
    try:
        resp = requests.get(f"{BASE_URL}/parches/{parche_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("id") == parche_id:
                log_test("Parches: GET /parches/{id}", True, f"Status: {resp.status_code}, Title: {data.get('title', '')[:30]}")
            else:
                log_test("Parches: GET /parches/{id}", False, f"Status: {resp.status_code}, ID mismatch")
        else:
            log_test("Parches: GET /parches/{id}", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Parches: GET /parches/{id}", False, f"Exception: {str(e)}")


def test_parches_create(token):
    """Test POST /parches (create new parche)"""
    try:
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        new_parche = {
            "title": f"Test Parche {random_string(6)}",
            "description": "This is a test parche created by automated testing",
            "category": "deportes",
            "city": "Bucaramanga",
            "location": "Test Location",
            "date": future_date,
            "time_start": "18:00",
            "capacity": 10,
            "visibility": "public"
        }
        
        resp = requests.post(f"{BASE_URL}/parches",
            json=new_parche,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 201:
            data = resp.json()
            if "id" in data and data.get("title") == new_parche["title"]:
                log_test("Parches: POST /parches (create)", True, f"Status: {resp.status_code}, Created: {data.get('title')}")
                return data["id"]
            else:
                log_test("Parches: POST /parches (create)", False, f"Status: {resp.status_code}, Missing id or title mismatch")
                return None
        else:
            log_test("Parches: POST /parches (create)", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return None
    except Exception as e:
        log_test("Parches: POST /parches (create)", False, f"Exception: {str(e)}")
        return None


def test_parches_join(token, parche_id):
    """Test POST /parches/{id}/join"""
    try:
        resp = requests.post(f"{BASE_URL}/parches/{parche_id}/join",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("joined") == True:
                log_test("Parches: POST /parches/{id}/join", True, f"Status: {resp.status_code}, Joined successfully")
            else:
                log_test("Parches: POST /parches/{id}/join", False, f"Status: {resp.status_code}, joined flag not true")
        else:
            log_test("Parches: POST /parches/{id}/join", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Parches: POST /parches/{id}/join", False, f"Exception: {str(e)}")


def test_parches_leave(token, parche_id):
    """Test POST /parches/{id}/leave"""
    try:
        resp = requests.post(f"{BASE_URL}/parches/{parche_id}/leave",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("joined") == False:
                log_test("Parches: POST /parches/{id}/leave", True, f"Status: {resp.status_code}, Left successfully")
            else:
                log_test("Parches: POST /parches/{id}/leave", False, f"Status: {resp.status_code}, joined flag still true")
        else:
            log_test("Parches: POST /parches/{id}/leave", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Parches: POST /parches/{id}/leave", False, f"Exception: {str(e)}")


def test_parches_like(token, parche_id):
    """Test POST /parches/{id}/like"""
    try:
        resp = requests.post(f"{BASE_URL}/parches/{parche_id}/like",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            log_test("Parches: POST /parches/{id}/like", True, f"Status: {resp.status_code}, Liked: {data.get('liked')}")
        else:
            log_test("Parches: POST /parches/{id}/like", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Parches: POST /parches/{id}/like", False, f"Exception: {str(e)}")


def test_parches_save(token, parche_id):
    """Test POST /parches/{id}/save"""
    try:
        resp = requests.post(f"{BASE_URL}/parches/{parche_id}/save",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            log_test("Parches: POST /parches/{id}/save", True, f"Status: {resp.status_code}, Saved: {data.get('saved')}")
        else:
            log_test("Parches: POST /parches/{id}/save", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Parches: POST /parches/{id}/save", False, f"Exception: {str(e)}")


def test_comments_create(token, parche_id):
    """Test POST /parches/{id}/comments"""
    try:
        comment = {"text": f"Test comment from automated testing {random_string(4)}"}
        resp = requests.post(f"{BASE_URL}/parches/{parche_id}/comments",
            json=comment,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 201:
            data = resp.json()
            if "id" in data and data.get("text") == comment["text"]:
                log_test("Comments: POST /parches/{id}/comments", True, f"Status: {resp.status_code}, Comment created")
            else:
                log_test("Comments: POST /parches/{id}/comments", False, f"Status: {resp.status_code}, Missing id or text mismatch")
        else:
            log_test("Comments: POST /parches/{id}/comments", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Comments: POST /parches/{id}/comments", False, f"Exception: {str(e)}")


def test_comments_list(token, parche_id):
    """Test GET /parches/{id}/comments"""
    try:
        resp = requests.get(f"{BASE_URL}/parches/{parche_id}/comments",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            log_test("Comments: GET /parches/{id}/comments", True, f"Status: {resp.status_code}, Comments: {len(data)}")
        else:
            log_test("Comments: GET /parches/{id}/comments", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Comments: GET /parches/{id}/comments", False, f"Exception: {str(e)}")


def test_friends_flow(token_a, token_b, user_b_id):
    """Test complete friends flow: request, accept, list"""
    try:
        # User A sends friend request to User B
        resp = requests.post(f"{BASE_URL}/friends/request/{user_b_id}",
            headers={"Authorization": f"Bearer {token_a}"},
            timeout=10)
        
        if resp.status_code == 201:
            data = resp.json()
            friendship_id = data.get("friendship_id")
            log_test("Friends: POST /friends/request/{user_id}", True, f"Status: {resp.status_code}, Request sent")
        else:
            log_test("Friends: POST /friends/request/{user_id}", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return
        
        # User B gets incoming requests
        resp = requests.get(f"{BASE_URL}/friends/requests/received",
            headers={"Authorization": f"Bearer {token_b}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if len(data) > 0:
                log_test("Friends: GET /friends/requests/received", True, f"Status: {resp.status_code}, Requests: {len(data)}")
                friendship_id = data[0].get("friendship_id")
            else:
                log_test("Friends: GET /friends/requests/received", False, f"Status: {resp.status_code}, No requests found")
                return
        else:
            log_test("Friends: GET /friends/requests/received", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return
        
        # User B accepts the request
        resp = requests.post(f"{BASE_URL}/friends/accept/{friendship_id}",
            headers={"Authorization": f"Bearer {token_b}"},
            timeout=10)
        
        if resp.status_code == 200:
            log_test("Friends: POST /friends/accept/{friendship_id}", True, f"Status: {resp.status_code}, Request accepted")
        else:
            log_test("Friends: POST /friends/accept/{friendship_id}", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return
        
        # User A gets friends list
        resp = requests.get(f"{BASE_URL}/friends",
            headers={"Authorization": f"Bearer {token_a}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            log_test("Friends: GET /friends", True, f"Status: {resp.status_code}, Friends: {len(data)}")
        else:
            log_test("Friends: GET /friends", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            
    except Exception as e:
        log_test("Friends: Complete flow", False, f"Exception: {str(e)}")


def test_notifications(token):
    """Test GET /notifications"""
    try:
        resp = requests.get(f"{BASE_URL}/notifications",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if "items" in data and "unread" in data:
                log_test("Notifications: GET /notifications", True, f"Status: {resp.status_code}, Unread: {data.get('unread')}, Total: {len(data.get('items', []))}")
            else:
                log_test("Notifications: GET /notifications", False, f"Status: {resp.status_code}, Missing items or unread")
        else:
            log_test("Notifications: GET /notifications", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Notifications: GET /notifications", False, f"Exception: {str(e)}")


def test_image_upload(token):
    """Test POST /upload and GET /files/{path}"""
    try:
        # Create a small test image (1x1 red pixel PNG)
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test.png', io.BytesIO(png_data), 'image/png')}
        resp = requests.post(f"{BASE_URL}/upload",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            if "path" in data and "url" in data:
                log_test("Upload: POST /upload", True, f"Status: {resp.status_code}, Path: {data.get('path')}")
                file_path = data.get("path")
                
                # Now try to GET the file
                resp2 = requests.get(f"{BASE_URL}/files/{file_path}", timeout=10)
                if resp2.status_code == 200 and len(resp2.content) > 0:
                    log_test("Upload: GET /files/{path}", True, f"Status: {resp2.status_code}, Size: {len(resp2.content)} bytes")
                else:
                    log_test("Upload: GET /files/{path}", False, f"Status: {resp2.status_code}, Empty or failed")
            else:
                log_test("Upload: POST /upload", False, f"Status: {resp.status_code}, Missing path or url")
        else:
            log_test("Upload: POST /upload", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("Upload: POST /upload", False, f"Exception: {str(e)}")


def main():
    """Run all backend tests"""
    print(f"\n{'='*80}")
    print(f"LOPI Backend API Test Suite")
    print(f"Base URL: {BASE_URL}")
    print(f"{'='*80}\n")
    
    # 1. AUTH TESTS
    print(f"\n{YELLOW}=== AUTH TESTS ==={RESET}\n")
    
    # Login with email
    token = test_auth_login_email()
    if not token:
        print(f"\n{RED}CRITICAL: Cannot proceed without valid token from email login{RESET}\n")
        sys.exit(1)
    
    # Login with username
    test_auth_login_username()
    
    # Wrong password
    test_auth_login_wrong_password()
    
    # Get current user
    user = test_auth_me(token)
    
    # Register new user
    new_token, new_user_data = test_auth_register()
    if new_token:
        # Verify new user can call /me
        new_user = test_auth_me(new_token)
        
        # Set interests for new user
        test_auth_interests(new_token)
        
        # Update profile for new user
        test_auth_profile_update(new_token)
    
    # 2. PARCHES TESTS
    print(f"\n{YELLOW}=== PARCHES TESTS ==={RESET}\n")
    
    # Get feed
    parches = test_parches_feed(token)
    
    # Get detail of first parche
    if parches and len(parches) > 0:
        first_parche_id = parches[0]["id"]
        test_parches_detail(token, first_parche_id)
    
    # Create new parche
    new_parche_id = test_parches_create(token)
    
    # Test join/leave/like/save on a parche (use first from feed if available)
    if parches and len(parches) > 0:
        test_parche_id = parches[0]["id"]
        test_parches_join(token, test_parche_id)
        test_parches_leave(token, test_parche_id)
        test_parches_like(token, test_parche_id)
        test_parches_save(token, test_parche_id)
    
    # 3. COMMENTS TESTS
    print(f"\n{YELLOW}=== COMMENTS TESTS ==={RESET}\n")
    
    if parches and len(parches) > 0:
        test_parche_id = parches[0]["id"]
        test_comments_create(token, test_parche_id)
        test_comments_list(token, test_parche_id)
    
    # 4. FRIENDS TESTS
    print(f"\n{YELLOW}=== FRIENDS TESTS ==={RESET}\n")
    
    # Create a second new user for friends testing
    second_token, second_user_data = test_auth_register()
    if second_token and new_token:
        second_user = test_auth_me(second_token)
        if second_user:
            test_friends_flow(new_token, second_token, second_user["id"])
    
    # 5. NOTIFICATIONS TESTS
    print(f"\n{YELLOW}=== NOTIFICATIONS TESTS ==={RESET}\n")
    
    test_notifications(token)
    
    # 6. IMAGE UPLOAD TESTS
    print(f"\n{YELLOW}=== IMAGE UPLOAD TESTS ==={RESET}\n")
    
    test_image_upload(token)
    
    # SUMMARY
    print(f"\n{'='*80}")
    print(f"TEST SUMMARY")
    print(f"{'='*80}\n")
    
    passed = sum(1 for t in test_results if t["passed"])
    failed = sum(1 for t in test_results if not t["passed"])
    total = len(test_results)
    
    print(f"Total Tests: {total}")
    print(f"{GREEN}Passed: {passed}{RESET}")
    print(f"{RED}Failed: {failed}{RESET}")
    print(f"Success Rate: {(passed/total*100):.1f}%\n")
    
    if failed > 0:
        print(f"{RED}FAILED TESTS:{RESET}")
        for t in test_results:
            if not t["passed"]:
                print(f"  ❌ {t['name']}")
                if t["details"]:
                    print(f"     {t['details']}")
        print()
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
