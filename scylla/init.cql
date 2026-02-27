CREATE KEYSPACE IF NOT EXISTS irctc
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};

USE irctc;

CREATE TABLE IF NOT EXISTS availability (
  route text,
  travel_date date,
  train_no text,
  status text,
  PRIMARY KEY ((route, travel_date), train_no)
);