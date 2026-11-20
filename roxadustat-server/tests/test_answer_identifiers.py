import json
from _support import ServerCase,payload


class AnswerIdentifiersTest(ServerCase):
    def test_invalid_identifiers_are_rejected(self):
        for ids in ([''], [' '], ['q1','q1'], ['abcdefghijkl1','abcdefghijkl2']):
            value=payload()
            value['answers']=[dict(value['answers'][0],id=identifier) for identifier in ids]
            with self.subTest(ids=ids):
                status,body=self.request('/api/submit',value)
                self.assertEqual(status,400)
                self.assertEqual(json.loads(body)['error'],'invalid')
