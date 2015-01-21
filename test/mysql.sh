#! /bin/bash

mysql -uroot -ptoto -e 'drop database lassi_tests'
mysql -uroot -ptoto -e 'create database lassi_tests'
mocha -b $*
