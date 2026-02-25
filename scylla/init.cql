CREATE KEYSPACE IF NOT EXISTS irctc
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};

USE irctc;

CREATE TABLE IF NOT EXISTS routes (
  origin text,
  destination text,
  train_id text,
  departure_time text,
  arrival_time text,
  price int,
  PRIMARY KEY ((origin, destination), train_id)
);

INSERT INTO routes (origin, destination, train_id, departure_time, arrival_time, price) 
VALUES ('DEL', 'MUM', '12951', '16:55', '08:35', 1200);

INSERT INTO routes (origin, destination, train_id, departure_time, arrival_time, price) 
VALUES ('DEL', 'MUM', '12953', '21:35', '14:50', 1500);

INSERT INTO routes (origin, destination, train_id, departure_time, arrival_time, price) 
VALUES ('DEL', 'MUM', '12955', '17:20', '10:05', 1100);

INSERT INTO routes (origin, destination, train_id, departure_time, arrival_time, price) 
VALUES ('DEL', 'MUM', '12957', '19:15', '11:45', 1350);

INSERT INTO routes (origin, destination, train_id, departure_time, arrival_time, price) 
VALUES ('MUM', 'DEL', '12952', '17:05', '09:55', 1200);

INSERT INTO routes (origin, destination, train_id, departure_time, arrival_time, price) 
VALUES ('BLR', 'DEL', '12430', '20:00', '05:15', 1800);
