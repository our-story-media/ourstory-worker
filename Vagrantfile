# Vagrant file for provisioning Bootlegger Worker Server Dev Environment
# Run: 
#   vagrant up
#
#
# You will need to edit your AWS and server credentials in:
#   /vagrant/local.js
#
# To restart server:
#   vagrant ssh
#   pm2 restart index


# -*- mode: ruby -*-
# vi: set ft=ruby :
Vagrant.configure(2) do |config|
  config.vm.hostname = "Bootlegger Worker Server"
  config.vm.box = "ubuntu/trusty64"
  config.vm.hostname ="bootlegger-worker"
  config.vm.provider "virtualbox" do |v|
    v.memory = 1024
  end
  config.ssh.shell = "bash -c 'BASH_ENV=/etc/profile exec bash'"
  config.vm.provision :shell, path: "bootstrap.sh"
  config.vm.post_up_message = "Bootlegger Worker Server Development Environment Started."
end
