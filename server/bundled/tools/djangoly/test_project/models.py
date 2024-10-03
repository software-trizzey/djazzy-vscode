from django.db import models, connection


class Author(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)

    def __str__(self):
        return self.name


class Book(models.Model):
    title = models.CharField(max_length=200)
    publication_date = models.DateField()
    author = models.ForeignKey(Author, on_delete=models.CASCADE)  # Missing related_name

    def __str__(self):
        return self.title


class Publisher(models.Model):
    name = models.CharField(max_length=255, blank=False)
    address = models.CharField(max_length=255, blank=True)
    established = models.DateField(null=True)
    books = models.ManyToManyField(Book)

    def __str__(self):
        return self.name
    

def run_raw_db_query_using_model_manager():
    return Publisher.objects.raw('SELECT * FROM my_table WHERE id = %s', [1])


def run_raw_db_query_using_connection():
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM my_table WHERE id = %s", [1])
        results = cursor.fetchall()
        return results
    