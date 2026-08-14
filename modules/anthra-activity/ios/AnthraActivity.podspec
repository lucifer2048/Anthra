require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AnthraActivity'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license'] || 'UNLICENSED'
  s.author         = package['author'] || 'Anthra'
  s.homepage       = package['homepage'] || 'https://anthra.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/anthra/anthra.git' }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,swift}'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
