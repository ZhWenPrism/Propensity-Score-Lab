import csv,io
from _support import ServerCase,payload


class QuestionAlignmentTest(ServerCase):
    def test_reordered_answers_keep_the_same_export_columns(self):
        first=payload()
        first['answers']=[{'id':'q1','layers':['evidence'],'reason':'first'},
                          {'id':'q2','layers':['method'],'reason':'second'}]
        second=payload()
        second['answers']=[{'id':'q2','layers':['value'],'reason':'q2 answer'},
                           {'id':'q1','layers':['method'],'reason':'q1 answer'}]
        for value in (first,second):
            self.assertEqual(self.request('/api/submit',value)[0],200)
        _,body=self.request('/api/submissions.csv?key=example-key')
        rows=list(csv.reader(io.StringIO(body.decode('utf-8-sig'))))
        self.assertEqual(rows[2][10],'q1 answer')
        self.assertEqual(rows[2][12],'q2 answer')
        self.assertEqual(rows[0][9:13],['q1 选择','q1 理由','q2 选择','q2 理由'])
