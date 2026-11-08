import unittest
from types import SimpleNamespace

from app.main import ArbeitenRequest, app


class KiServiceRoutesTest(unittest.TestCase):
    def test_suggest_arbeiten_route_exists_and_returns_local_model_shape(self):
        route = next((r for r in app.routes if getattr(r, 'path', None) == '/api/suggest-arbeiten'), None)
        self.assertIsNotNone(route)
        self.assertIn('POST', route.methods)

        request = ArbeitenRequest(beschreibung='Bremsen quietschen', fahrzeug='Citroën C3')
        http_request = SimpleNamespace(client=SimpleNamespace(host='127.0.0.1'))
        response = route.endpoint(request, http_request)

        self.assertTrue(response['success'])
        self.assertIn('arbeiten', response['data'])
        self.assertEqual(response['data']['teile_vermutung'], ['Bremsbelaege', 'Bremsscheiben'])

    def test_predict_uses_post_and_the_arbeiten_request_contract(self):
        route = next((r for r in app.routes if getattr(r, 'path', None) == '/api/predict'), None)
        self.assertIsNotNone(route)
        self.assertIn('POST', route.methods)


if __name__ == '__main__':
    unittest.main()
