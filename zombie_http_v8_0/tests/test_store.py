import os
import tempfile
import unittest

import app as zombie_app


class StoreApiTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.original_users_file = zombie_app.USERS_FILE
        zombie_app.USERS_FILE = os.path.join(self.tmpdir.name, "users.json")
        zombie_app.save_users({})
        self.client = zombie_app.app.test_client()
        self.username = "storetester"
        zombie_app.ensure_user(self.username)
        users = zombie_app.load_users()
        record = zombie_app.normalize_user_record(users[self.username])
        record["coins"] = 100
        resource_code = zombie_app.STORE_ITEMS["resources"][0]["item"]
        record.setdefault("resources", zombie_app.RESOURCE_DEFAULTS.copy())
        record["resources"][resource_code] = 2
        users[self.username] = record
        zombie_app.save_users(users)
        self.resource_code = resource_code
        self.resource_price = zombie_app.STORE_ITEMS["resources"][0]["price"]
        self.resource_amount = zombie_app.STORE_ITEMS["resources"][0].get("amount", 1)

    def tearDown(self):
        zombie_app.USERS_FILE = self.original_users_file
        self.tmpdir.cleanup()

    def test_store_includes_resources(self):
        response = self.client.get("/api/store", query_string={"u": self.username})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("resources", payload)
        resources = {item["item"]: item for item in payload["resources"]}
        self.assertIn(self.resource_code, resources)
        self.assertEqual(resources[self.resource_code]["quantity"], 2)
        self.assertIn("resource_inventory", payload)
        self.assertEqual(payload["resource_inventory"].get(self.resource_code), 2)

    def test_buy_resource_updates_inventory(self):
        response = self.client.post(
            "/api/buy",
            json={"username": self.username, "item": self.resource_code},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        users = zombie_app.load_users()
        record = zombie_app.normalize_user_record(users[self.username])
        self.assertEqual(
            record["resources"].get(self.resource_code),
            2 + self.resource_amount,
        )
        self.assertEqual(record["coins"], 100 - self.resource_price)
        profile = payload.get("profile", {})
        self.assertIn("resources", profile)
        self.assertEqual(
            profile["resources"].get(self.resource_code),
            2 + self.resource_amount,
        )


if __name__ == "__main__":
    unittest.main()
